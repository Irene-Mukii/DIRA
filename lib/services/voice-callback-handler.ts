import { after, NextRequest, NextResponse } from "next/server";
import { processPendingRecordings } from "@/lib/services/call-recordings";
import { resolvePublicBaseUrl } from "@/lib/services/voice-config";
import {
  type CallbackSource,
  ingestCallback,
  isCallbackAuthorized,
  parseCallbackForm,
} from "@/lib/services/voice-callbacks";
import {
  buildEmptyVoiceXml,
  buildRecordingCallbackXml,
  buildRecordingInstructionsXml,
} from "@/lib/services/voice-xml";

function xmlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function callbackLog(
  endpoint: string,
  request: Request,
  values: {
    status: number;
    branch: string;
    isActive?: boolean | null;
    direction?: string | null;
    hasSessionId?: boolean;
    hasRecordingUrl?: boolean;
    recordingCallbackConfigured?: boolean;
    callState?: string | null;
    responseBytes?: number;
    containsSay?: boolean;
    containsRecord?: boolean;
  },
): void {
  console.info("Africa's Talking voice callback", {
    endpoint,
    status: values.status,
    responseContentType:
      values.status >= 400
        ? "application/json"
        : endpoint === "events"
          ? "application/json"
          : "application/xml; charset=utf-8",
    requestContentType: request.headers.get("content-type")?.split(";")[0] ?? null,
    isActive: values.isActive ?? null,
    direction: values.direction ?? null,
    hasSessionId: values.hasSessionId ?? false,
    hasRecordingUrl: values.hasRecordingUrl ?? false,
    branch: values.branch,
    recordingCallbackConfigured: values.recordingCallbackConfigured ?? false,
    callState: values.callState ?? null,
    responseBytes: values.responseBytes ?? null,
    containsSay: values.containsSay ?? false,
    containsRecord: values.containsRecord ?? false,
  });
}

async function readCallbackFields(
  request: NextRequest,
  endpoint: string,
): Promise<{ fields: NonNullable<ReturnType<typeof parseCallbackForm>> } | { response: NextResponse }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("application/x-www-form-urlencoded") &&
    !contentType.startsWith("multipart/form-data")
  ) {
    callbackLog(endpoint, request, { status: 415, branch: "unsupported_content_type" });
    return {
      response: NextResponse.json({ error: "Unsupported callback content type" }, { status: 415 }),
    };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    callbackLog(endpoint, request, { status: 400, branch: "malformed_form" });
    return { response: NextResponse.json({ error: "Invalid callback form" }, { status: 400 }) };
  }
  const fields = parseCallbackForm(form);
  if (!fields) {
    callbackLog(endpoint, request, { status: 400, branch: "missing_session_id" });
    return { response: NextResponse.json({ error: "Invalid callback" }, { status: 400 }) };
  }
  return { fields };
}

function scheduleRecordingProcessing(recordingId: string): void {
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

/**
 * Africa's Talking voice callback: called when the teacher answers, and again on
 * later call updates. It (1) authenticates via the secret in the URL (path segment
 * `pathSecret`, or legacy ?token=), (2) records the callback idempotently, and
 * (3) answers with the documented partial-recording action: <Record> contains the
 * spoken prompt and the recording callback URL. Recording callbacks return XML while
 * the call remains active; the final inactive callback ends with an empty Response.
 * Verify execution on a real call because Africa's Talking documentation is client-rendered.
 */
export async function handleVoiceInstructions(
  request: NextRequest,
  pathSecret?: string,
): Promise<NextResponse> {
  if (!isCallbackAuthorized(request, pathSecret)) {
    callbackLog("voice", request, { status: 401, branch: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readCallbackFields(request, "voice");
  if ("response" in parsed) {
    return parsed.response;
  }
  const fields = parsed.fields;
  if (fields.isActive === null) {
    callbackLog("voice", request, {
      status: 400,
      branch: "missing_active_state",
      direction: fields.direction,
      hasSessionId: true,
      hasRecordingUrl: Boolean(fields.recordingUrl),
    });
    return NextResponse.json({ error: "Missing call active state" }, { status: 400 });
  }

  try {
    const result = await ingestCallback(fields, "voice");
    if (!result) {
      // Inbound/unknown traffic: hang up without recording anything.
      const xml = buildEmptyVoiceXml();
      const response = xmlResponse(xml);
      callbackLog("voice", request, {
        status: response.status,
        branch: "ignored_inbound",
        isActive: fields.isActive,
        direction: fields.direction,
        hasSessionId: true,
        hasRecordingUrl: Boolean(fields.recordingUrl),
        responseBytes: Buffer.byteLength(xml),
      });
      return response;
    }
    if (result.newRecording && result.recordingId) {
      scheduleRecordingProcessing(result.recordingId);
    }
    if (fields.isActive === false) {
      const xml = buildEmptyVoiceXml();
      const response = xmlResponse(xml);
      callbackLog("voice", request, {
        status: response.status,
        branch: "inactive_final_callback",
        isActive: fields.isActive,
        direction: fields.direction,
        hasSessionId: true,
        hasRecordingUrl: Boolean(fields.recordingUrl),
        responseBytes: Buffer.byteLength(xml),
      });
      return response;
    }
    if (fields.recordingUrl) {
      const xml = buildRecordingCallbackXml();
      const response = xmlResponse(xml);
      callbackLog("voice", request, {
        status: response.status,
        branch: "recording_received",
        isActive: fields.isActive,
        direction: fields.direction,
        hasSessionId: true,
        hasRecordingUrl: true,
        responseBytes: Buffer.byteLength(xml),
        containsSay: xml.includes("<Say>"),
      });
      return response;
    }

    const baseUrl = resolvePublicBaseUrl(request);
    if (!baseUrl) {
      callbackLog("voice", request, {
        status: 503,
        branch: "public_base_url_missing",
        isActive: fields.isActive,
        direction: fields.direction,
        hasSessionId: true,
      });
      return NextResponse.json({ error: "Public callback base URL is not configured" }, { status: 503 });
    }
    const recordingCallback =
      pathSecret !== undefined
        ? `${baseUrl}/api/voice/cb/${encodeURIComponent(pathSecret)}/recording`
        : `${baseUrl}/api/voice/recording?token=${encodeURIComponent(
            new URL(request.url).searchParams.get("token") ?? "",
          )}`;
    const xml = buildRecordingInstructionsXml(recordingCallback);
    const response = xmlResponse(xml);
    callbackLog("voice", request, {
      status: response.status,
      branch: "recording_instructions",
      isActive: fields.isActive,
      direction: fields.direction,
      hasSessionId: true,
      recordingCallbackConfigured: true,
      callState: fields.callSessionState,
      responseBytes: Buffer.byteLength(xml),
      containsSay: xml.includes("<Say>"),
      containsRecord: xml.includes("<Record "),
    });
    return response;
  } catch (error) {
    console.error("Voice callback failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    callbackLog("voice", request, { status: 500, branch: "processing_error" });
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
    callbackLog(source, request, { status: 401, branch: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = await readCallbackFields(request, source);
  if ("response" in parsed) {
    return parsed.response;
  }
  const fields = parsed.fields;
  if (fields.isActive === null) {
    callbackLog(source, request, {
      status: 400,
      branch: "missing_active_state",
      direction: fields.direction,
      hasSessionId: true,
      hasRecordingUrl: Boolean(fields.recordingUrl),
    });
    return NextResponse.json({ error: "Missing call active state" }, { status: 400 });
  }

  try {
    const result = await ingestCallback(fields, source);
    if (result?.newRecording && result.recordingId) {
      scheduleRecordingProcessing(result.recordingId);
    }
    if (!result) {
      const xml = source === "recording" ? buildEmptyVoiceXml() : null;
      const response = xml
        ? xmlResponse(xml)
        : NextResponse.json({ ok: true });
      callbackLog(source, request, {
        status: response.status,
        branch: "ignored_inbound",
        isActive: fields.isActive,
        direction: fields.direction,
        hasSessionId: true,
        hasRecordingUrl: Boolean(fields.recordingUrl),
        responseBytes: xml ? Buffer.byteLength(xml) : undefined,
      });
      return response;
    }

    const xml =
      source === "recording"
        ? fields.isActive
          ? buildRecordingCallbackXml()
          : buildEmptyVoiceXml()
        : null;
    const response = xml
      ? xmlResponse(xml)
      : NextResponse.json({ ok: true });
    callbackLog(source, request, {
      status: response.status,
      branch:
        source === "recording"
          ? fields.isActive
            ? "recording_callback_continues"
            : "recording_callback_inactive"
          : "event_recorded",
      isActive: fields.isActive,
      direction: fields.direction,
      hasSessionId: true,
      hasRecordingUrl: Boolean(fields.recordingUrl),
      responseBytes: xml ? Buffer.byteLength(xml) : undefined,
      containsSay: Boolean(xml?.includes("<Say>")),
    });
    return response;
  } catch (error) {
    console.error("Provider callback failed", {
      source,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    callbackLog(source, request, { status: 500, branch: "processing_error" });
    // A 5xx lets the provider redeliver; ingestion is idempotent.
    return NextResponse.json({ error: "Callback processing failed" }, { status: 500 });
  }
}
