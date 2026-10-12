import { after, NextRequest, NextResponse } from "next/server";
import { processPendingRecordings } from "@/lib/services/call-recordings";
import { resolvePublicBaseUrl } from "@/lib/services/voice-config";
import {
  type CallbackSource,
  ingestCallback,
  isCallbackAuthorized,
  parseCallbackForm,
} from "@/lib/services/voice-callbacks";

const TEACHER_GREETING =
  "Hello teacher, please share remarks you have for one or more of your focus group of the week. Make sure to state the name of the child you are talking about before each of their observations. You may begin after the beep, and press the hash key when you are done.";
const TEACHER_THANKS = "Thank you. Your remarks have been recorded. Goodbye.";

function xmlResponse(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Africa's Talking voice callback: called when the teacher answers, and again on
 * later call updates. It (1) authenticates via the secret in the URL (path segment
 * `pathSecret`, or legacy ?token=), (2) records the callback idempotently, and
 * (3) answers with the call instructions: greeting, then <Record> whose callbackUrl
 * receives the finished recording. The recording callback reuses the same secret
 * style as the incoming request. Only the first (active, no recording yet) request
 * gets the prompt; repeats and the final isActive=0 notification get an empty
 * response so the prompt is not replayed.
 * Instruction format (<Say>/<Record>) is from secondary docs: VERIFY on a real call.
 */
export async function handleVoiceInstructions(
  request: NextRequest,
  pathSecret?: string,
): Promise<NextResponse> {
  if (!isCallbackAuthorized(request, pathSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fields = parseCallbackForm(await request.formData().catch(() => new FormData()));
  if (!fields) {
    return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  }

  try {
    const result = await ingestCallback(fields, "voice");
    if (!result) {
      // Inbound/unknown traffic: hang up without recording anything.
      return xmlResponse("");
    }
    if (fields.isActive === false || fields.recordingUrl) {
      return xmlResponse("");
    }

    const baseUrl = resolvePublicBaseUrl(request);
    if (!baseUrl) {
      return xmlResponse("");
    }
    const recordingCallback =
      pathSecret !== undefined
        ? `${baseUrl}/api/voice/cb/${encodeURIComponent(pathSecret)}/recording`
        : `${baseUrl}/api/voice/recording?token=${encodeURIComponent(
            new URL(request.url).searchParams.get("token") ?? "",
          )}`;
    return xmlResponse(
      `<Say>${escapeXml(TEACHER_GREETING)}</Say>` +
        `<Record finishOnKey="#" maxLength="180" timeout="10" trimSilence="true" playBeep="true" callbackUrl="${escapeXml(recordingCallback)}">` +
        `</Record>` +
        `<Say>${escapeXml(TEACHER_THANKS)}</Say>`,
    );
  } catch (error) {
    console.error("Voice callback failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Callback processing failed" }, { status: 500 });
  }
}

/**
 * Shared handler for the recording and events callbacks (non-instruction callbacks).
 * Authenticates, records the callback idempotently and, the first time a recording
 * URL is seen, schedules transcription and draft generation after the response is
 * sent. Providers retry slow callbacks, so the heavy work never runs inline.
 * Duplicate deliveries do nothing new; stragglers are picked up by the internal worker.
 */
export async function handleProviderCallback(
  request: NextRequest,
  source: CallbackSource,
  pathSecret?: string,
): Promise<NextResponse> {
  if (!isCallbackAuthorized(request, pathSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fields = parseCallbackForm(await request.formData().catch(() => new FormData()));
  if (!fields) {
    return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  }

  try {
    const result = await ingestCallback(fields, source);
    if (result?.newRecording && result.recordingId) {
      const recordingId = result.recordingId;
      after(async () => {
        try {
          await processPendingRecordings({ recordingId });
        } catch (error) {
          console.error("Background recording processing failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Provider callback failed", {
      source,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    // A 5xx lets the provider redeliver; ingestion is idempotent.
    return NextResponse.json({ error: "Callback processing failed" }, { status: 500 });
  }
}
