import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db/client";

/**
 * Africa's Talking callback handling (voice, events and recording callbacks).
 * Field names follow secondary documentation (official pages were unavailable):
 * VERIFY against a real callback payload before relying on any single field.
 */

export type CallbackSource = "voice" | "events" | "recording";
type CallStatus =
  | "requested"
  | "ringing"
  | "in_progress"
  | "completed"
  | "not_answered"
  | "failed";

export interface CallbackFields {
  sessionId: string;
  direction: string | null;
  isActive: boolean | null;
  callSessionState: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
}

export interface IngestResult {
  callId: string;
  /** Set when the callback carried a recording, new or already known. */
  recordingId: string | null;
  /** True only the first time this recording is seen (drives one-time processing). */
  newRecording: boolean;
  duplicateEvent: boolean;
}

/**
 * Check the shared secret supplied in the callback URL.
 * Africa's Talking is not known to sign callbacks or send custom headers, so a secret
 * embedded in the URL configured in the dashboard is the authentication. The dashboard
 * rejected "?token=" query strings, so the preferred form is a path segment
 * (/api/voice/cb/<secret>/...), passed in as `pathSecret`; "?token=" still works for
 * callers that can use it. Fails closed if VOICE_CALLBACK_SECRET is unset.
 */
export function isCallbackAuthorized(request: Request, pathSecret?: string): boolean {
  const expected = process.env.VOICE_CALLBACK_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const supplied =
    pathSecret ?? new URL(request.url).searchParams.get("token") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extract only the fields DIRA uses from a callback form; null if there is no usable sessionId. */
export function parseCallbackForm(form: FormData): CallbackFields | null {
  const text = (key: string): string | null => {
    const value = form.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const sessionId = text("sessionId");
  if (!sessionId || !/^[A-Za-z0-9_.-]{1,100}$/.test(sessionId)) {
    return null;
  }
  const isActiveRaw = text("isActive");
  const duration = Number.parseInt(text("durationInSeconds") ?? "", 10);
  const recordingUrl = text("recordingUrl");
  return {
    sessionId,
    direction: text("direction"),
    isActive: isActiveRaw === null ? null : isActiveRaw === "1",
    callSessionState: text("callSessionState")?.slice(0, 50) ?? null,
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    recordingUrl: recordingUrl && recordingUrl.length <= 2000 ? recordingUrl : null,
  };
}

/** Map the provider's state text (and isActive) to DIRA's call status; unknown text is not guessed. */
function mapStatus(fields: CallbackFields): CallStatus | null {
  const state = fields.callSessionState?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (state.includes("notanswered") || state.includes("noanswer")) return "not_answered";
  if (state.includes("failed") || state.includes("rejected") || state.includes("busy")) return "failed";
  if (state.includes("completed")) return "completed";
  if (state.includes("ring")) return "ringing";
  if (state.includes("active") || state.includes("answered")) return "in_progress";
  if (fields.isActive === false) return "completed";
  if (fields.isActive === true) return "in_progress";
  return null;
}

/** Later lifecycle stages outrank earlier ones, so out-of-order callbacks never move a call backwards. */
function rank(status: CallStatus): number {
  switch (status) {
    case "requested":
      return 0;
    case "ringing":
      return 1;
    case "in_progress":
      return 2;
    default:
      return 3;
  }
}

/**
 * Record one provider callback idempotently.
 * - The call row is upserted by provider sessionId, so it does not matter whether the
 *   callback or the dispatcher's response is processed first.
 * - Identical deliveries share one event_key and are stored once.
 * - A recording URL is stored once per call (unique call+url) for later transcription.
 * Inbound calls (not ours) are ignored so strangers dialling the number are never recorded.
 */
export async function ingestCallback(
  fields: CallbackFields,
  source: CallbackSource,
): Promise<IngestResult | null> {
  if (fields.direction?.toLowerCase() === "inbound") {
    return null;
  }

  const eventKey = createHash("sha256")
    .update(
      [
        source,
        fields.sessionId,
        fields.isActive,
        fields.callSessionState,
        fields.durationSeconds,
        fields.recordingUrl,
      ].join("|"),
    )
    .digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The no-op update on conflict takes the row lock, serialising concurrent callbacks.
    const call = await client.query<{ call_id: string; status: CallStatus }>(
      `INSERT INTO teacher_calls (provider_session_id, direction)
       VALUES ($1, $2)
       ON CONFLICT (provider_session_id) DO UPDATE SET updated_at = NOW()
       RETURNING call_id, status`,
      [fields.sessionId, fields.direction],
    );
    const { call_id: callId, status: currentStatus } = call.rows[0];

    const event = await client.query(
      `INSERT INTO call_events
         (call_id, event_key, source, is_active, call_session_state, duration_seconds, has_recording)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        callId,
        eventKey,
        source,
        fields.isActive,
        fields.callSessionState,
        fields.durationSeconds,
        fields.recordingUrl !== null,
      ],
    );

    const mapped = mapStatus(fields);
    const nextStatus =
      mapped && rank(mapped) >= rank(currentStatus) ? mapped : currentStatus;
    await client.query(
      `UPDATE teacher_calls
       SET status = $2,
           duration_seconds = COALESCE($3, duration_seconds),
           ended_at = CASE WHEN $4::boolean THEN COALESCE(ended_at, NOW()) ELSE ended_at END,
           updated_at = NOW()
       WHERE call_id = $1`,
      [callId, nextStatus, fields.durationSeconds, rank(nextStatus) === 3],
    );

    let recordingId: string | null = null;
    let newRecording = false;
    if (fields.recordingUrl) {
      const inserted = await client.query<{ recording_id: string }>(
        `INSERT INTO call_recordings (call_id, recording_url, duration_seconds)
         VALUES ($1, $2, $3)
         ON CONFLICT (call_id, recording_url) DO NOTHING
         RETURNING recording_id`,
        [callId, fields.recordingUrl, fields.durationSeconds],
      );
      if (inserted.rows[0]) {
        recordingId = inserted.rows[0].recording_id;
        newRecording = true;
      } else {
        const existing = await client.query<{ recording_id: string }>(
          `SELECT recording_id FROM call_recordings
           WHERE call_id = $1 AND recording_url = $2`,
          [callId, fields.recordingUrl],
        );
        recordingId = existing.rows[0]?.recording_id ?? null;
      }
    }

    await client.query("COMMIT");
    return {
      callId,
      recordingId,
      newRecording,
      duplicateEvent: event.rowCount === 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
