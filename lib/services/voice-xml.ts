const TEACHER_RECORDING_PROMPT =
  "Please share remarks you have for one or more of your focus group of the week. State the child's name before each observation. You may begin after the beep and press the hash key when you are done.";

const RECORDING_ACKNOWLEDGEMENT =
  "Thank you for calling. Goodbye.";

/** Escape dynamic callback URLs before embedding them in provider XML. */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Build the documented partial-recording action with its spoken prompt nested inside it. */
export function buildRecordingInstructionsXml(callbackUrl: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    `<Record finishOnKey="#" maxLength="180" trimSilence="true" playBeep="true" callbackUrl="${escapeXml(callbackUrl)}">` +
    `<Say>${TEACHER_RECORDING_PROMPT}</Say>` +
    "</Record>" +
    "</Response>"
  );
}

/** Continue a partial-recording callback with the provider's expected XML response. */
export function buildRecordingCallbackXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Say>${RECORDING_ACKNOWLEDGEMENT}</Say></Response>`
  );
}

/** Return an empty but well-formed voice response when the provider says the call ended. */
export function buildEmptyVoiceXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}
