# Dira — Integrations

> **Important:** Selected, configured, tested and working are different states. The source pack does not prove that any third-party integration currently works. Record test date, environment, and result before promoting a status.

## 1. Integration overview

| Integration | Intended use | Interface classification | Current status in architecture | Verification needed |
|---|---|---|---|---|
| GLM-5.3 hosted API | Reasoning for test suggestions and Evidence Card language | Ordinary model API | Selected in revised architecture; provider/API details to confirm | Credentials, model ID, endpoint, latency, errors, token/cost limits |
| PostgreSQL | Durable learner, observation, test, outcome and related records | Database connection from server-side code | Core storage choice | Schema/migrations, constraints, persistence, backups/dev resets |
| Whissle | Transcribe submitted in-app audio and, if implemented, phone-captured audio | Ordinary speech-to-text API unless a separate MCP server is truly used | Selected provider; account/endpoint/audio details to confirm | Supported format, maximum duration/size, confidence metadata if provided, timeout and error behaviour |
| Africa's Talking SMS | Weekly focus reminders/notifications | Ordinary API unless a separate MCP server is truly used | Selected provider | Credentials, sender/short-code requirements, delivery status/callbacks, Kenya account permissions |
| Africa's Talking Voice | Outbound teacher callback/call capture where implemented | Ordinary voice API unless a separate MCP server is truly used | Selected provider; capability to verify | Outbound calling, caller ID, IVR/recording/webhooks, audio retrieval, account/country restrictions and consent process |
| Keeper.sh calendar MCP | Unified calendar context for follow-up | **Borrowed external MCP server** | Selected/planned; not complete until actual call succeeds | OAuth 2.1 flow for hosted endpoint, Streamable HTTP transport, MCP discovery/invocation, limits and returned event data |
| Educational-source retrieval | Fast relevant lookup before every test suggestion | Separate retrieval/search adapter; not automatically MCP | Required behaviour; exact provider/adapter remains to be selected and tested | Source coverage, citations, timeout, cancellation, empty results, query privacy, reliability |
| Google Cloud Run | Intended app deployment target from the shared plan | Hosting/platform service | Target in shared planning document; confirm actual deploy | Clean clone/build/start, environment secrets, health/readiness, smoke test |

## 2. Keeper.sh — borrowed calendar MCP (selected)

**Repository:** <https://github.com/ridafkih/keeper.sh>  
**MCP documentation:** <https://www.keeper.sh/docs/mcp>  
**Hosted MCP endpoint stated in the revised architecture:** `https://www.keeper.sh/mcp`

Keeper.sh is selected to provide calendar functionality through an existing third-party MCP server. The revised architecture lists support for connected Google Calendar, Outlook/Microsoft 365, iCloud, Fastmail, CalDAV, and read-only ICS/iCal feeds. The documents do not establish a native Calendly integration; do not claim direct Calendly support. Supported providers and functionality must be checked against current Keeper documentation during setup.

### Why reuse it?

- It provides a calendar capability through MCP rather than forcing Dira to implement a provider-specific calendar server.
- A shared interface can reduce Dira's provider-specific logic if the configured provider is supported.
- It leaves Dira responsible for its own learner-evidence workflow and educational guardrails while delegating calendar access to an existing implementation.
- It gives the team an inspectable external MCP integration to explain during the judging demonstration.

### Integration steps

1. Read the current Keeper documentation and confirm the server endpoint, available tools, authentication, and terms for hosted versus self-hosted use.
2. Confirm that `lib/agent/mcp-client.ts` can support the required Streamable HTTP transport and hosted OAuth 2.1 consent flow. Do not assume the current client already supports these.
3. Connect a non-sensitive test calendar account.
4. Use the MCP protocol to discover tools and call a read-oriented operation such as `list_calendars` or `get_events` only if that tool actually exists in the current server schema.
5. Request a minimal date-bounded set of events and inspect the returned data.
6. Pass only necessary schedule context into Dira. Do not ingest full calendar content into learner evidence.
7. Add a test log showing date, tool discovered, call completed, safe result shape and any limitation. Remove tokens and personal calendar details from logs.
8. Verify rate limits before demo. The revised architecture notes a hosted free-plan limit of 25 combined API/MCP requests per day; this may change and should be rechecked. If insufficient, explicitly decide whether self-hosting is feasible rather than silently bypassing MCP.

**Requirement boundary:** the borrowed-MCP requirement is not met by adding a Keeper URL to the docs. It is met by an actual Dira MCP-client connection and a real tool invocation. Until then, call this integration “selected/planned.”

### Correct use in Dira

Calendar event/time data may inform the timing of follow-ups or weekly planning. It does not prove that the class happened, that the teacher made the call, or that a learner attended. Test completion and learner observations must come from an explicit teacher-reported action and be recorded through Dira's observation workflow.

## 3. Educational-source retrieval

### Required runtime behaviour

Before finalising each `suggest_test`, make a bounded external retrieval attempt for guidance relevant to the classroom question and context. The shared planning document discusses IB, EEF, AMI and WWC; the architecture also mentions IBEF. Confirm the intended source list with the product owner so “IB” versus “IBEF” is not silently conflated. For now, source configuration should be explicit and only sources actually queried may be cited.

Do not assume GLM-5.3 has browsing capability. Choose and verify a separate API/retrieval service or an appropriate existing server. This adapter is not assumed to be MCP unless the team connects to a genuine MCP server for retrieval.

### Timeout and fallback

- Make the timeout configurable; a few seconds is a starting point, not a final SLA.
- Cancel requests where supported and avoid uncontrolled retries.
- Track statuses such as `success`, `no_relevant_results`, `timeout`, `provider_error`, and `not_configured`.
- If results are returned, include only relevant short excerpts and actual source identifiers/URLs in the prompt/output.
- If the lookup fails or times out, continue with the learner's persisted evidence and model knowledge; state that external guidance was unavailable for the run and provide no invented source citation.
- Avoid sending learner names or unnecessary identifiers. Query the educational issue/context, not a child's identity.

### Deferred persistence

Do not create a dedicated PostgreSQL table for the educational-source catalogue/content in the current scope. The system should query externally at suggestion time. A future scope addition may store source metadata, canonical URL, publisher/title, publication/update date, retrieval timestamp, short excerpt or content pointer, licence/usage notes and search indexes after a separate data-model decision.

## 4. Whissle speech-to-text

### In-app voice flow

`Browser recorder → server-side upload/forward → Whissle transcription → transcript review/validation → log_observation MCP tool → PostgreSQL`.

Use the actual API contract for audio file/container/codec, size, duration and response fields. Do not assume Whissle provides confidence scores unless its endpoint returns them. Preserve the distinction between original audio/reference and transcript where allowed. If transcription is ambiguous about identity, negation or key numbers, ask the teacher to confirm before saving.

### Failures

A Whissle timeout/unavailability must not produce a fake transcript or a saved observation. Show an actionable message and preserve the recording or transcript draft where feasible. Retries must not duplicate the resulting observation.

## 5. Africa's Talking SMS

Use the SMS API for short teacher-focused reminders if enabled. The message should not contain a detailed learner profile or disclose sensitive learner data unnecessarily. Do not show delivery success until the provider response or appropriate delivery callback supports that status. Keep provider request IDs and outcomes in safe operational logs.

## 6. Africa's Talking outbound Voice

The older shared document refers to Twilio Voice, but the revised architecture selects Africa's Talking Voice. Use Africa's Talking for the current design unless the product owner explicitly changes that decision. Verify that the account supports the required outbound-call flow, audio/recording retrieval or IVR, webhook callbacks and local requirements before promising the basic-phone experience.

Caller ID alone is not proof of teacher identity. Authenticate the teacher through an approved challenge/context before associating a transcript with a learner. The voice call initiates/captures audio; Whissle transcribes it; Dira validates and persists it through `log_observation`.

## 7. PostgreSQL

Use PostgreSQL as the system of record for learner context, teacher/observer context, observations, suggested tests, linked outcomes and operational metadata appropriate to the MVP. See `DATA_MODEL.md`.

- Never put database credentials in client code.
- Verify writes before showing success.
- Add foreign keys/constraints and indexes for learner timelines, observation dates, linked test IDs and idempotency.
- Use synthetic data for development and demonstration.
- Do not add the deferred educational-source catalogue/content table in the current scope.

## 8. Hosted GLM model

Keep the model provider behind `lib/models.ts`. Confirm the actual endpoint, model identifier, key, supported input/output modes and limits from the selected provider account. Enforce output validation in Dira code; model prompts are not a security boundary. Never assume external source access is included in the model API unless explicitly documented and verified.

The shared planning PDF discusses an open-weight model for a real task, but the revised architecture names GLM-5.3 and does not specify an open-weight secondary model. Confirm the judging requirement and model choice with the team; do not claim an open-weight model is integrated until logs show it actually executed and influenced application output.

## 9. Configuration and secrets

The final environment-variable names must follow actual code and provider documentation. `.env.example` should document variable names and safe placeholders for:

- PostgreSQL connection.
- Hosted GLM API key/model ID.
- Whissle API credentials/configuration.
- Africa's Talking SMS and Voice credentials/configuration.
- Keeper endpoint and authentication/OAuth configuration for the selected hosted/self-hosted mode.
- Educational retrieval adapter credentials/configuration and timeout.
- App origin/session/authentication configuration and operational logging settings.

Do not invent variable names that are not used by code. Keep `.env.local` and real credentials out of Git. Do not place secrets in `NEXT_PUBLIC_*` variables.

## 10. Integration status record

For each provider, record:

- `selected`, `configured`, `smoke-tested`, `end-to-end-tested`, or `blocked`;
- test date/environment;
- minimal expected result;
- observed result and error;
- limits/cost assumptions;
- fallback behaviour;
- responsible owner.

Only say an integration is working when the test has succeeded in the current code path.
