import "server-only";

import {
  getVoiceDemoDestination,
  isE164,
  isProductionDemoVoiceEnabled,
  isProductionPublicDemoVoiceEnabled,
  isVoiceDemoMode,
} from "@/lib/services/voice-config";

const REQUEST_TIMEOUT_MS = 15_000;
const PRODUCTION_VOICE_ENDPOINT = "https://voice.africastalking.com/call";
const SANDBOX_VOICE_ENDPOINT =
  "https://voice.sandbox.africastalking.com/call";

export interface AfricaTalkingCallOptions {
  username: string;
  apiKey: string;
  callerId: string;
  destination: string;
  clientRequestId: string;
  sandbox: boolean;
  /** "demo" sends only to the configured demo number; "real" to a DB-resolved teacher. */
  mode: "demo" | "real";
  publicDemoAuthorized?: true;
}

export interface AfricaTalkingCallResult {
  httpStatus: number;
  /** Provider sessionId used to link callbacks and recordings; null if not returned. */
  sessionId: string | null;
}

export class AfricaTalkingCallError extends Error {
  readonly code: "provider_rejected" | "outcome_unknown";

  constructor(
    message: string,
    code: "provider_rejected" | "outcome_unknown",
  ) {
    super(message);
    this.name = "AfricaTalkingCallError";
    this.code = code;
  }
}

/**
 * Submit a single call request to Africa's Talking and return its sessionId.
 * Never include phone values or provider response bodies in thrown errors or logs.
 * Callback URLs are NOT sent here: Africa's Talking reads them from the dashboard
 * (per phone number), so only the caller ID, destination and request id go out.
 */
export async function initiateAfricaTalkingCall(
  options: AfricaTalkingCallOptions,
): Promise<AfricaTalkingCallResult> {
  assertCallAllowed(
    options.mode,
    options.destination,
    options.publicDemoAuthorized === true,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const body = new URLSearchParams({
    username: options.username,
    from: options.callerId,
    to: options.destination,
    clientRequestId: options.clientRequestId,
  });

  try {
    const response = await fetch(
      options.sandbox
        ? SANDBOX_VOICE_ENDPOINT
        : PRODUCTION_VOICE_ENDPOINT,
      {
        method: "POST",
        headers: {
          apikey: options.apiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      },
    );

    // The provider SDK documents only 200 and 201 as accepted call submissions.
    if (response.status === 200 || response.status === 201) {
      return {
        httpStatus: response.status,
        sessionId: await readSessionId(response),
      };
    }
    if (response.status >= 400 && response.status < 500) {
      throw new AfricaTalkingCallError(
        "Africa's Talking rejected the call request",
        "provider_rejected",
      );
    }

    throw new AfricaTalkingCallError(
      "Africa's Talking call result is unknown",
      "outcome_unknown",
    );
  } catch (error) {
    if (error instanceof AfricaTalkingCallError) {
      throw error;
    }

    // A timeout or lost connection may happen after the provider accepted the
    // call, so the dispatcher must not automatically submit the request again.
    throw new AfricaTalkingCallError(
      "Africa's Talking call result is unknown",
      "outcome_unknown",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract entries[0].sessionId from the /call response body.
 * Response shape is from secondary sources (official docs unavailable): VERIFY against
 * a real response. A missing/odd body returns null rather than failing an accepted call.
 */
async function readSessionId(response: Response): Promise<string | null> {
  try {
    const parsed: unknown = await response.json();
    const entries =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { entries?: unknown }).entries
        : null;
    const first = Array.isArray(entries) ? entries[0] : null;
    const sessionId =
      typeof first === "object" && first !== null
        ? (first as { sessionId?: unknown }).sessionId
        : null;
    return typeof sessionId === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(sessionId)
      ? sessionId
      : null;
  } catch {
    return null;
  }
}

/**
 * Enforce the destination gate at the provider boundary itself.
 * - Tests never place chargeable calls: Vitest always blocks this client (mock it).
 * - Demo mode: only the configured demo number; production requires explicit opt-in
 *   (DEMO BYPASS: skips teacher phone/consent lookup so the flow can be tested).
 * - Real mode: demo mode must be off, so a real teacher number can never be dialled
 *   while the demo switch is on, and the demo number is never a silent fallback.
 */
function assertCallAllowed(
  mode: "demo" | "real",
  destination: string,
  publicDemoAuthorized: boolean,
): void {
  if (process.env.VITEST) {
    throw new Error("Africa's Talking calls are blocked under automated tests");
  }
  if (mode === "demo") {
    const configuredDestination = getVoiceDemoDestination();
    if (
      publicDemoAuthorized &&
      process.env.NODE_ENV === "production" &&
      isProductionPublicDemoVoiceEnabled() &&
      isE164(destination)
    ) {
      return;
    }
    if (
      (process.env.NODE_ENV === "production" &&
        !isProductionDemoVoiceEnabled()) ||
      !isVoiceDemoMode() ||
      !configuredDestination ||
      destination !== configuredDestination
    ) {
      throw new Error("Africa's Talking call blocked by the demo destination gate");
    }
    return;
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE === "true"
  ) {
    throw new Error("Real teacher calls are disabled in demo deployments");
  }
  if (isVoiceDemoMode() || destination === getVoiceDemoDestination()) {
    throw new Error("Africa's Talking call blocked: real mode cannot use demo settings");
  }
}
