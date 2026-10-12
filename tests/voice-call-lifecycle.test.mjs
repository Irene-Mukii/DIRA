import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

// Voice and transcription clients refuse to call paid providers under Vitest.
const { pool } = await import("../lib/db/client.ts");
const { matchLearnerCandidates } = await import(
  "../lib/services/call-observations.ts"
);
const { ingestCallback, isCallbackAuthorized, parseCallbackForm } =
  await import("../lib/services/voice-callbacks.ts");
const { initiateAfricaTalkingCall } = await import(
  "../lib/external-mcp/voice.ts"
);
const { transcribeRecording } = await import("../lib/external-mcp/stt.ts");

const sessions = [];
function newSession() {
  const id = `ATVid_test_${randomUUID()}`;
  sessions.push(id);
  return id;
}

afterAll(async () => {
  if (sessions.length > 0) {
    const calls = `SELECT call_id FROM teacher_calls WHERE provider_session_id = ANY($1)`;
    for (const sql of [
      `DELETE FROM call_events WHERE call_id IN (${calls})`,
      `DELETE FROM call_recordings WHERE call_id IN (${calls})`,
      `DELETE FROM teacher_calls WHERE provider_session_id = ANY($1)`,
    ]) {
      await pool
        .query(sql, [sessions])
        .catch((error) => console.error("voice test cleanup failed:", error));
    }
  }
  await pool.end();
});

const roster = [
  { learner_id: "L001", display_name: "Amina Wanjiku", class_id: "C1" },
  { learner_id: "L014", display_name: "Amina Njeri", class_id: "C1" },
  { learner_id: "L020", display_name: "Brian Otieno", class_id: "C1" },
];

describe("learner matching is conservative", () => {
  it("returns every learner sharing a first name (ambiguous)", () => {
    expect(matchLearnerCandidates("Amina", roster)).toEqual(["L001", "L014"]);
  });
  it("returns one learner for a full name", () => {
    expect(matchLearnerCandidates("amina njeri", roster)).toEqual(["L014"]);
  });
  it("returns nothing for unknown or missing names", () => {
    expect(matchLearnerCandidates("Zed", roster)).toEqual([]);
    expect(matchLearnerCandidates(undefined, roster)).toEqual([]);
  });
});

describe("callback auth and parsing", () => {
  it("accepts the secret as a path segment (dashboard rejects ?token=)", () => {
    const previous = process.env.VOICE_CALLBACK_SECRET;
    process.env.VOICE_CALLBACK_SECRET = "s3cret";
    const request = new Request("http://x/api/voice/cb/s3cret/recording");
    expect(isCallbackAuthorized(request, "s3cret")).toBe(true);
    expect(isCallbackAuthorized(request, "nope!!")).toBe(false);
    if (previous === undefined) delete process.env.VOICE_CALLBACK_SECRET;
    else process.env.VOICE_CALLBACK_SECRET = previous;
  });
  it("fails closed without a secret and accepts only the right token", () => {
    const previous = process.env.VOICE_CALLBACK_SECRET;
    delete process.env.VOICE_CALLBACK_SECRET;
    expect(isCallbackAuthorized(new Request("http://x/y?token=a"))).toBe(false);
    process.env.VOICE_CALLBACK_SECRET = "s3cret";
    expect(isCallbackAuthorized(new Request("http://x/y?token=s3cret"))).toBe(true);
    expect(isCallbackAuthorized(new Request("http://x/y?token=wrong!"))).toBe(false);
    if (previous === undefined) delete process.env.VOICE_CALLBACK_SECRET;
    else process.env.VOICE_CALLBACK_SECRET = previous;
  });
  it("requires a sessionId", () => {
    expect(parseCallbackForm(new FormData())).toBeNull();
  });
});

describe("callback ingestion is idempotent and order-safe", () => {
  it("dedupes events and recordings, and never regresses status", async () => {
    const sessionId = newSession();
    const base = {
      sessionId,
      direction: "outbound",
      isActive: false,
      callSessionState: "Completed",
      durationSeconds: 30,
      recordingUrl: "https://voice.africastalking.com/recordings/test.mp3",
    };

    const first = await ingestCallback(base, "recording");
    const repeat = await ingestCallback(base, "recording");
    expect(first.newRecording).toBe(true);
    expect(repeat.newRecording).toBe(false);
    expect(repeat.duplicateEvent).toBe(true);
    expect(repeat.recordingId).toBe(first.recordingId);

    // A late "ringing" callback must not move a completed call backwards.
    await ingestCallback(
      { ...base, isActive: true, callSessionState: "Ringing", recordingUrl: null },
      "voice",
    );
    const call = await pool.query(
      `SELECT status FROM teacher_calls WHERE provider_session_id = $1`,
      [sessionId],
    );
    expect(call.rows).toHaveLength(1);
    expect(call.rows[0].status).toBe("completed");

    const recordings = await pool.query(
      `SELECT count(*)::int AS n FROM call_recordings WHERE call_id = $1`,
      [first.callId],
    );
    expect(recordings.rows[0].n).toBe(1);
  });

  it("ignores inbound calls", async () => {
    const result = await ingestCallback(
      {
        sessionId: newSession(),
        direction: "inbound",
        isActive: true,
        callSessionState: null,
        durationSeconds: null,
        recordingUrl: null,
      },
      "voice",
    );
    expect(result).toBeNull();
  });
});

describe("tests can never reach paid providers", () => {
  it("builds a production voice request with the voice credentials (fetch stubbed, no network)", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ entries: [{ sessionId: "ATVid_x1" }] }), {
        status: 201,
      });
    });
    vi.stubEnv("VITEST", "");
    try {
      const result = await initiateAfricaTalkingCall({
        username: "voice-user",
        apiKey: "voice-key",
        callerId: "+15555550100",
        destination: "+15555550101",
        clientRequestId: "req-1",
        sandbox: false,
        mode: "demo",
      });
      expect(result.sessionId).toBe("ATVid_x1");
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://voice.africastalking.com/call");
    expect(calls[0].init.headers.apikey).toBe("voice-key");
    const body = new URLSearchParams(calls[0].init.body);
    expect(body.get("username")).toBe("voice-user");
    expect(body.get("from")).toBe("+15555550100");
    expect(body.get("to")).toBe("+15555550101");
  });

  it("blocks a non-demo destination in demo mode (fetch stubbed)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch must not be reached");
    });
    vi.stubEnv("VITEST", "");
    try {
      await expect(
        initiateAfricaTalkingCall({
          username: "u",
          apiKey: "k",
          callerId: "+15555550100",
          destination: "+15555550999",
          clientRequestId: "x",
          sandbox: false,
          mode: "demo",
        }),
      ).rejects.toThrow(/blocked/);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("blocks outbound calls", async () => {
    await expect(
      initiateAfricaTalkingCall({
        to: "+15555550101",
        mode: "demo",
        clientRequestId: "x",
      }),
    ).rejects.toThrow();
  });
  it("blocks transcription", async () => {
    await expect(
      transcribeRecording(Buffer.from("x"), "audio/mpeg", "a.mp3"),
    ).rejects.toThrow();
  });

  it("sends a mocked recording to OpenAI with the configured key and model", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ text: "Teacher transcript." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubEnv("VITEST", "");
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv("OPENAI_STT_MODEL", "gpt-transcribe");
    try {
      const result = await transcribeRecording(
        Buffer.from("mock audio"),
        "audio/mpeg",
        "recording.mp3",
      );
      expect(result).toEqual({
        text: "Teacher transcript.",
        provider: "openai",
      });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    expect(calls[0].init.headers.Authorization).toBe("Bearer test-only-key");
    const form = calls[0].init.body;
    expect(form.get("model")).toBe("gpt-transcribe");
    expect(form.get("file").name).toBe("recording.mp3");
  });
});
