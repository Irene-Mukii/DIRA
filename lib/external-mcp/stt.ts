import "server-only";

/**
 * MVP batch transcription client using OpenAI's Audio Transcriptions API.
 * This sends call audio to OpenAI; before go-live, replace it with a reviewed
 * self-hosted open-weight transcription service so learner audio stays in
 * infrastructure DIRA controls.
 */

const REQUEST_TIMEOUT_MS = 60_000;
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 25_000_000;
const DEFAULT_MODEL = "gpt-transcribe";
const SUPPORTED_EXTENSIONS = new Set([
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
]);

export class TranscriptionError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(`Transcription failed: ${code}`);
    this.name = "TranscriptionError";
  }
}

export interface TranscriptionResult {
  text: string;
  provider: "openai";
}

/** Send a completed recording to OpenAI and return its transcript without logging audio or secrets. */
export async function transcribeRecording(
  audio: Uint8Array,
  contentType: string,
  filename: string,
): Promise<TranscriptionResult> {
  if (process.env.VITEST) {
    throw new TranscriptionError("blocked_in_tests", false);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new TranscriptionError("openai_not_configured", false);
  }
  if (audio.byteLength === 0) {
    throw new TranscriptionError("empty_audio", false);
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new TranscriptionError("audio_too_large", false);
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new TranscriptionError("unsupported_audio_format", false);
  }

  const model = process.env.OPENAI_STT_MODEL?.trim() || DEFAULT_MODEL;
  const form = new FormData();
  form.append(
    "file",
    new Blob([audio as BlobPart], { type: contentType }),
    filename,
  );
  form.append("model", model);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });

    if (response.status === 401 || response.status === 403) {
      throw new TranscriptionError("openai_auth_failed", false);
    }
    if (response.status === 413 || response.status === 415) {
      throw new TranscriptionError("openai_rejected_audio", false);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new TranscriptionError(`openai_http_${response.status}`, true);
    }
    if (!response.ok) {
      throw new TranscriptionError(`openai_http_${response.status}`, false);
    }

    const parsed: unknown = await response.json().catch(() => null);
    const text =
      typeof parsed === "object" && parsed !== null && "text" in parsed &&
      typeof parsed.text === "string"
        ? parsed.text.trim()
        : "";
    if (!text) {
      throw new TranscriptionError("empty_transcript", false);
    }
    return { text, provider: "openai" };
  } catch (error) {
    if (error instanceof TranscriptionError) {
      throw error;
    }
    throw new TranscriptionError("openai_unreachable", true);
  } finally {
    clearTimeout(timeout);
  }
}
