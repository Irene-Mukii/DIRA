import "server-only";

import { runCallTranscriptAgent } from "@/lib/agent/orchestrator";
import { pool } from "@/lib/db/client";
import {
  transcribeRecording,
  TranscriptionError,
} from "@/lib/external-mcp/stt";
import { saveUnsegmentedFallbackDraft } from "@/lib/services/call-observations";

/**
 * Recording pipeline: download -> OpenAI transcription -> agent drafts.
 * Each stage has its own status and attempt counter in call_recordings, an atomic
 * claim (so two workers never process the same recording) and a bounded retry count.
 */

const MAX_TRANSCRIPTION_ATTEMPTS = 3;
const MAX_PROCESSING_ATTEMPTS = 3;
const STALE_CLAIM_MINUTES = 15;
const MAX_AUDIO_BYTES = 25_000_000;
const MAX_REDIRECTS = 3;

class RecordingError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(`Recording step failed: ${code}`);
    this.name = "RecordingError";
  }
}

interface ClaimedRecording {
  recording_id: string;
  recording_url: string;
  attempts: number;
}

/**
 * Hosts the recording may be fetched from: Africa's Talking domains plus any extra
 * hosts in VOICE_RECORDING_ALLOWED_HOSTS. This is an SSRF guard because the URL arrives
 * in a callback; it also stops us ever sending credentials to an arbitrary host.
 */
function isAllowedRecordingHost(url: URL): boolean {
  if (url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const extra = (process.env.VOICE_RECORDING_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return (
    host === "africastalking.com" ||
    host.endsWith(".africastalking.com") ||
    extra.includes(host)
  );
}

/**
 * Download a recording with host allow-listing on every redirect hop and a size cap.
 * UNVERIFIED: whether Africa's Talking recording URLs need authentication is not
 * confirmed, so no credentials are sent; a 401/403 is reported as a non-retryable failure.
 */
async function downloadRecording(
  recordingUrl: string,
): Promise<{ audio: Uint8Array; contentType: string }> {
  if (process.env.VITEST) {
    throw new RecordingError("blocked_in_tests", false);
  }
  let url: URL;
  try {
    url = new URL(recordingUrl);
  } catch {
    throw new RecordingError("invalid_recording_url", false);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedRecordingHost(url)) {
      throw new RecordingError("recording_host_not_allowed", false);
    }
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new RecordingError("recording_unreachable", true);
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new RecordingError("recording_bad_redirect", false);
      }
      url = new URL(location, url);
      continue;
    }
    if (response.status === 404 || response.status === 425) {
      // The recording may simply not be published yet.
      throw new RecordingError("recording_not_ready", true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new RecordingError("recording_access_denied", false);
    }
    if (!response.ok) {
      throw new RecordingError(
        `recording_http_${response.status}`,
        response.status >= 500,
      );
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_AUDIO_BYTES) {
      throw new RecordingError("recording_too_large", false);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (!reader) {
      throw new RecordingError("recording_empty", false);
    }
    for (;;) {
      const { done, value } = await reader.read().catch(() => {
        throw new RecordingError("recording_unreachable", true);
      });
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new RecordingError("recording_too_large", false);
      }
      chunks.push(value);
    }
    if (total === 0) {
      throw new RecordingError("recording_empty", true);
    }
    const audio = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      audio,
      contentType: response.headers.get("content-type")?.split(";")[0] ?? "audio/wav",
    };
  }
  throw new RecordingError("too_many_redirects", false);
}

/** Map the provider's audio media type to a format supported by OpenAI transcription. */
function filenameFor(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return "recording.mp3";
  if (type.includes("mpga")) return "recording.mpga";
  if (type.includes("m4a")) return "recording.m4a";
  if (type.includes("mp4")) return "recording.mp4";
  if (type.includes("wav") || type.includes("wave")) return "recording.wav";
  if (type.includes("webm")) return "recording.webm";
  throw new RecordingError("unsupported_recording_format", false);
}

/**
 * Atomically claim one recording for download/transcription.
 * Also reclaims recordings whose worker died mid-step (stale for STALE_CLAIM_MINUTES).
 */
async function claimForTranscription(
  recordingId: string | null,
): Promise<ClaimedRecording | null> {
  const result = await pool.query<ClaimedRecording>(
    `UPDATE call_recordings
     SET status = 'downloading', attempts = attempts + 1, updated_at = NOW()
     WHERE recording_id = (
       SELECT recording_id FROM call_recordings
       WHERE ($1::uuid IS NULL OR recording_id = $1)
         AND attempts < $2
         AND (
           status IN ('pending', 'failed_retryable')
           OR (status IN ('downloading', 'transcribing')
               AND updated_at < NOW() - make_interval(mins => $3))
         )
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING recording_id, recording_url, attempts`,
    [recordingId, MAX_TRANSCRIPTION_ATTEMPTS, STALE_CLAIM_MINUTES],
  );
  return result.rows[0] ?? null;
}

/** Run download + transcription for one claimed recording and persist the outcome. */
async function transcribeClaimed(claimed: ClaimedRecording): Promise<boolean> {
  try {
    const { audio, contentType } = await downloadRecording(claimed.recording_url);
    await pool.query(
      `UPDATE call_recordings SET status = 'transcribing', updated_at = NOW()
       WHERE recording_id = $1`,
      [claimed.recording_id],
    );
    const transcript = await transcribeRecording(audio, contentType, filenameFor(contentType));
    await pool.query(
      `UPDATE call_recordings
       SET status = 'transcribed', transcript_text = $2, transcription_provider = $3,
           last_error_code = NULL, updated_at = NOW()
       WHERE recording_id = $1`,
      [claimed.recording_id, transcript.text, transcript.provider],
    );
    return true;
  } catch (error) {
    const code =
      error instanceof RecordingError || error instanceof TranscriptionError
        ? error.code
        : "unexpected_error";
    const retryable =
      (error instanceof RecordingError || error instanceof TranscriptionError
        ? error.retryable
        : true) && claimed.attempts < MAX_TRANSCRIPTION_ATTEMPTS;
    await pool.query(
      `UPDATE call_recordings
       SET status = $2, last_error_code = $3, updated_at = NOW()
       WHERE recording_id = $1`,
      [claimed.recording_id, retryable ? "failed_retryable" : "failed", code],
    );
    console.error("Call recording transcription step failed", {
      recordingId: claimed.recording_id,
      code,
      retryable,
    });
    return false;
  }
}

/**
 * Claim a transcribed recording for agent processing and generate drafts.
 * On the last allowed attempt a failure falls back to one unassigned draft with the
 * whole transcript, so the teacher's words are never discarded.
 */
async function processTranscribed(recordingId: string | null): Promise<boolean> {
  const claim = await pool.query<{
    recording_id: string;
    transcript_text: string;
    processing_attempts: number;
  }>(
    `UPDATE call_recordings
     SET processing_status = 'processing',
         processing_attempts = processing_attempts + 1, updated_at = NOW()
     WHERE recording_id = (
       SELECT recording_id FROM call_recordings
       WHERE ($1::uuid IS NULL OR recording_id = $1)
         AND status = 'transcribed'
         AND processing_attempts < $2
         AND (
           processing_status IN ('pending', 'failed_retryable')
           OR (processing_status = 'processing'
               AND updated_at < NOW() - make_interval(mins => $3))
         )
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING recording_id, transcript_text, processing_attempts`,
    [recordingId, MAX_PROCESSING_ATTEMPTS, STALE_CLAIM_MINUTES],
  );
  const row = claim.rows[0];
  if (!row) {
    return false;
  }

  try {
    await runCallTranscriptAgent(row.recording_id, row.transcript_text);
    await pool.query(
      `UPDATE call_recordings
       SET processing_status = 'done', last_error_code = NULL, updated_at = NOW()
       WHERE recording_id = $1`,
      [row.recording_id],
    );
    return true;
  } catch (error) {
    const lastAttempt = row.processing_attempts >= MAX_PROCESSING_ATTEMPTS;
    let fallbackSaved = false;
    if (lastAttempt) {
      try {
        await saveUnsegmentedFallbackDraft(row.recording_id);
        fallbackSaved = true;
      } catch {
        fallbackSaved = false;
      }
    }
    await pool.query(
      `UPDATE call_recordings
       SET processing_status = $2, last_error_code = $3, updated_at = NOW()
       WHERE recording_id = $1`,
      [
        row.recording_id,
        lastAttempt ? (fallbackSaved ? "done" : "failed") : "failed_retryable",
        error instanceof Error ? error.name.slice(0, 60) : "agent_failed",
      ],
    );
    console.error("Call transcript agent processing failed", {
      recordingId: row.recording_id,
      attempt: row.processing_attempts,
      fallbackSaved,
    });
    return false;
  }
}

/**
 * Work through pending recordings (transcription, then draft generation).
 * Safe to call repeatedly or concurrently: claims are atomic and every step is
 * idempotent. Pass a recordingId to focus on one recording, e.g. right after its callback.
 */
export async function processPendingRecordings(
  options: { recordingId?: string; limit?: number } = {},
): Promise<{ transcribed: number; drafted: number }> {
  const limit = options.limit ?? 5;
  const target = options.recordingId ?? null;
  let transcribed = 0;
  let drafted = 0;

  for (let i = 0; i < limit; i += 1) {
    const claimed = await claimForTranscription(target);
    if (!claimed) break;
    if (await transcribeClaimed(claimed)) transcribed += 1;
    if (target) break;
  }
  for (let i = 0; i < limit; i += 1) {
    if (!(await processTranscribed(target))) break;
    drafted += 1;
    if (target) break;
  }
  return { transcribed, drafted };
}
