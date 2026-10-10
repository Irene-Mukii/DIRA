import "server-only";

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
}

export interface AfricaTalkingCallResult {
  httpStatus: number;
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
 * Submit a single call request to Africa's Talking; never include phone values
 * or provider response bodies in thrown errors or operational logs.
 */
export async function initiateAfricaTalkingCall(
  options: AfricaTalkingCallOptions,
): Promise<AfricaTalkingCallResult> {
  assertDemoDestination(options.destination);
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
      return { httpStatus: response.status };
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

/** Enforce the local test-number gate at the provider boundary itself. */
function assertDemoDestination(destination: string): void {
  const configuredDestination = process.env.DIRA_DEMO_CALL_TO?.trim();
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DIRA_DEMO_CALL_TEST_MODE !== "true" ||
    !configuredDestination ||
    destination !== configuredDestination
  ) {
    throw new Error("Africa's Talking call blocked by the demo destination gate");
  }
}
