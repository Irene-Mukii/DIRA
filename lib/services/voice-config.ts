import "server-only";

/**
 * Voice-call configuration shared by the dispatcher, provider client and callbacks.
 * Reads the existing DIRA_DEMO_CALL_* names and accepts the DIRA_VOICE_DEMO_* names
 * as aliases, so either spelling in the environment works.
 */

/** True when outbound calls must go only to the configured demo recipient. */
export function isVoiceDemoMode(): boolean {
  const value =
    process.env.DIRA_VOICE_DEMO_MODE ?? process.env.DIRA_DEMO_CALL_TEST_MODE;
  return value?.trim() === "true";
}

/** The single phone number demo-mode calls are allowed to reach, if configured. */
export function getVoiceDemoDestination(): string | undefined {
  const value =
    process.env.DIRA_VOICE_DEMO_TO ?? process.env.DIRA_DEMO_CALL_TO;
  return value?.trim() || undefined;
}

/** Accept international E.164 format without formatting or guessing a number. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * The public origin Africa's Talking can reach (e.g. the current ngrok URL).
 * DIRA_PUBLIC_BASE_URL wins; otherwise it is derived from the forwarded request
 * headers, which is only safe because callers have already passed the token check.
 */
export function resolvePublicBaseUrl(request: Request): string | null {
  const configured = process.env.DIRA_PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) {
    return null;
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
