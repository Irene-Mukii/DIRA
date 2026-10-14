"use client";

import { useState } from "react";

type CallState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "accepted" }
  | { status: "error"; message: string };

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export default function DemoCallDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [callState, setCallState] = useState<CallState>({ status: "idle" });
  const isValidPhone = E164_PATTERN.test(phoneNumber.trim());

  async function requestCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidPhone || !consent || callState.status === "submitting") return;

    setCallState({ status: "submitting" });
    try {
      const response = await fetch("/api/demo-call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim(), consent }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The demo call could not be requested.";
        setCallState({ status: "error", message });
        return;
      }
      setCallState({ status: "accepted" });
    } catch {
      setCallState({
        status: "error",
        message: "Unable to contact Dira. Please try again later.",
      });
    }
  }

  function closeDialog() {
    if (callState.status === "submitting") return;
    setIsOpen(false);
    setCallState({ status: "idle" });
    setPhoneNumber("");
    setConsent(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-300 dark:text-blue-300 dark:hover:bg-gray-800"
      >
        Test a call
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-call-title"
            className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="demo-call-title" className="text-xl font-semibold">
                Request a demo call
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                disabled={callState.status === "submitting"}
                aria-label="Close demo call dialog"
                className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>

            {callState.status === "accepted" ? (
              <p role="status" className="text-sm text-green-700 dark:text-green-300">
                The call provider accepted the request. Your phone may ring shortly.
                This confirms submission only, not that the call connected.
              </p>
            ) : (
              <form onSubmit={requestCall} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="demo-call-phone" className="block text-sm font-medium">
                    Your phone number
                  </label>
                  <input
                    id="demo-call-phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+254712345678"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    pattern="\+[1-9][0-9]{7,14}"
                    required
                    maxLength={16}
                    aria-describedby="demo-call-phone-help"
                    className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-600"
                  />
                  <p id="demo-call-phone-help" className="text-xs text-gray-600 dark:text-gray-400">
                    Include the country code, starting with +, followed by 8–15 digits.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    required
                    className="mt-1"
                  />
                  <span>
                    I confirm this is my number and agree to receive this call.
                    The call records my response, which may be transcribed and
                    saved in the shared synthetic demo-teacher workflow. I will
                    not mention real learner names or sensitive information.
                  </span>
                </label>

                <p className="text-xs text-amber-800 dark:text-amber-300">
                  One call per number in 24 hours; at most 10 demo calls across
                  all users in 24 hours. The call may incur provider charges.
                </p>

                {callState.status === "error" && (
                  <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                    {callState.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    !isValidPhone ||
                    !consent ||
                    callState.status === "submitting"
                  }
                  className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {callState.status === "submitting" ? "Requesting call…" : "Call me"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
