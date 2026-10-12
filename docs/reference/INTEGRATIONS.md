# Dira — Integrations

> **Important:** Selected, configured, tested and working are different states. The source pack does not prove that any third-party integration currently works. Record test date, environment, and result before promoting a status.

## 1. Integration overview

| Integration | Intended use | Interface classification | Current status in architecture | Verification needed |
|---|---|---|---|---|
| GLM-5.3 hosted API | Reasoning for test suggestions and Evidence Card language | Ordinary model API | Selected in revised architecture; provider/API details to confirm | Credentials, model ID, endpoint, latency, errors, token/cost limits |
| PostgreSQL | Durable learner, observation, test, outcome and related records | Database connection from server-side code | Core storage choice | Schema/migrations, constraints, persistence, backups/dev resets |
| OpenAI Audio Transcriptions | Transcribe completed phone-call recordings for the MVP | Ordinary HTTPS API; not MCP | Implemented as an MVP integration; sends audio outside DIRA-controlled infrastructure | API key, account access, supported recording format and operational/data-handling review |
| Africa's Talking SMS | Weekly focus reminders/notifications | Ordinary API unless a separate MCP server is truly used | Selected provider | Credentials, sender/short-code requirements, delivery status/callbacks, Kenya account permissions |
| Africa's Talking Voice | Outbound teacher follow-up call | Ordinary server-side voice API; not MCP | Request adapter, non-production demo-gated dispatcher, and teacher-scoped development status view implemented; no live call verified | Account credentials, caller ID, sandbox/live behavior, provider callbacks/status authentication, recording/audio retrieval, account restrictions and teacher consent |
| Keeper.sh calendar MCP | Unified calendar context for follow-up | **Borrowed external MCP server** | Selected/planned; not complete until actual call succeeds | OAuth 2.1 flow for hosted endpoint, Streamable HTTP transport, MCP discovery/invocation, limits and returned event data |
| Educational-source retrieval | Fast relevant lookup before every test suggestion | Separate retrieval/search adapter; not automatically MCP | Required behaviour; exact provider/adapter remains to be selected and tested | Source coverage, citations, timeout, cancellation, empty results, query privacy, reliability |
| Google Cloud Run | Intended app deployment target from the shared plan | Hosting/platform service | Target in shared planning document; confirm actual deploy | Clean clone/build/start, environment secrets, health/readiness, smoke test |

## 2. Keeper.sh — borrowed calendar MCP (selected)

**Repository:** <https://github.com/ridafkih/keeper.sh>  
**MCP documentation:** <https://www.keeper.sh/docs/mcp>  
**Hosted MCP endpoint stated in the revised architecture:** `https://www.keeper.sh/mcp`

Keeper.sh is selected to provide calendar functionality through an existing third-party MCP server. Its current repository README documents Google Calendar, Outlook, iCloud, Fastmail, CalDAV, and pull-only iCal/ICS feeds. The documents do not establish a native Calendly integration; do not claim direct Calendly support. Supported providers and functionality must be checked against current Keeper documentation during setup.

### Why reuse it?

- It provides a calendar capability through MCP rather than forcing Dira to implement a provider-specific calendar server.
- A shared interface can reduce Dira's provider-specific logic if the configured provider is supported.
- It leaves Dira responsible for its own learner-evidence workflow and educational guardrails while delegating calendar access to an existing implementation.
- It gives the team an inspectable external MCP integration to explain during the judging demonstration.

### Integration steps

1. Read the current Keeper documentation and confirm the server endpoint, available tools, authentication, and terms for hosted versus self-hosted use.
2. Dira now uses the official `@modelcontextprotocol/sdk` client with Streamable HTTP transport in `lib/agent/mcp-client.ts`. The connection requires an `OAuthClientProvider`; OAuth tokens and per-teacher authorization are not yet implemented or persisted by Dira.
3. Connect a non-sensitive test calendar account.
4. Discover tools from the live MCP server. Keeper's current repository README lists read-oriented tools including `list_calendars`, `get_event_count`, `get_events`, `get_event`, and `find_free_time`, plus event-write and sync tools. Treat live discovery—not this documentation—as authoritative.
5. Use the read-only adapter in `lib/external-mcp/calendar.ts` for a bounded event count or date-limited event read. It enforces the discovered read-only annotation and schema inputs; the current event-read adapter limits ranges to 24 hours. Do not invoke write or sync tools in the MVP call-scheduling phases.
6. Pass only necessary schedule context into Dira. Do not ingest full calendar content into learner evidence.
7. Add a test log showing date, tool discovered, call completed, safe result shape and any limitation. Remove tokens and personal calendar details from logs.
8. The Keeper repository currently documents hosted OAuth 2.1 and a free-plan cap of 25 combined API/MCP requests per day. Recheck the hosted terms and limits before demo. If insufficient, explicitly decide whether self-hosting is feasible rather than silently bypassing MCP.

**Current status:** the SDK transport, endpoint configuration, tool discovery, and guarded read-only adapter are implemented. A live authenticated Keeper call is **blocked/unverified** until a non-sensitive test calendar is authorized through OAuth and Dira has a secure provider for that OAuth session. The borrowed-MCP requirement is not met by adding a Keeper URL to the docs; it is met by an actual Dira-client connection and real tool invocation.

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

## 4. Speech-to-text (MVP: OpenAI; replace before go-live)

### In-app voice flow

`Africa's Talking recording → server-side download → OpenAI Audio Transcriptions API → transcript → DIRA agent drafts → teacher review → PostgreSQL`.

The implementation uses `POST https://api.openai.com/v1/audio/transcriptions` with `OPENAI_API_KEY` and defaults to model `gpt-transcribe` (override with optional `OPENAI_STT_MODEL`). It expects a JSON `text` result. The current API guide lists a 25 MB maximum and MP3, MP4, MPEG, MPGA, M4A, WAV and WebM input. The server rejects unsupported types and files above the limit rather than fabricating or silently altering a transcript.

**MVP-only security exception:** this sends teacher recordings that may contain learner information to OpenAI. Do not use this as the go-live transcription architecture. Before go-live, replace it with a security-reviewed, self-hosted open-weight transcription model in infrastructure DIRA controls, and verify data handling, access controls, retention and accuracy. Never expose the API key to browser code or logs.

### Failures

An OpenAI timeout/unavailability must not produce a fake transcript or a saved observation. Failures are recorded and retried within the existing attempt limit; retries must not duplicate drafts. The transcription provider name is stored with the transcript and copied to a confirmed observation.

## 5. Africa's Talking SMS

Use the SMS API for short teacher-focused reminders if enabled. The message should not contain a detailed learner profile or disclose sensitive learner data unnecessarily. Do not show delivery success until the provider response or appropriate delivery callback supports that status. Keep provider request IDs and outcomes in safe operational logs.

## 6. Africa's Talking outbound Voice

The older shared document refers to Twilio Voice, but the revised architecture selects Africa's Talking Voice. Use Africa's Talking for the current design unless the product owner explicitly changes that decision. Verify that the account supports the required outbound-call flow, audio/recording retrieval or IVR, webhook callbacks and local requirements before promising the basic-phone experience.

The current integration decision is to use Africa's Talking Voice as an ordinary
server-side API, not through Dira's MCP client. The public official Africa's Talking
materials checked document API/SDK usage; no public first-party Voice MCP server was
found. This is not proof that no private or unpublished MCP server exists. The
official [Node.js SDK](https://github.com/AfricasTalkingLtd/africastalking-node.js)
documents a `call` operation; use a genuine MCP server only if one is independently
verified and deliberately selected.

The server-side adapter uses the provider's official Node SDK request contract:
`POST https://voice.africastalking.com/call`, URL-encoded
`username`, `from`, `to`, and `clientRequestId`, with the `apikey` header. This
request format is based on the official
[Africa's Talking Node.js SDK](https://github.com/AfricasTalkingLtd/africastalking-node.js).
Provider acceptance is not proof of ringing, answering, completion, or successful
recording. Verify those states through callbacks from the project's actual account.

For safety, the current dispatcher refuses production execution and requires explicit
local demo mode plus server-side credentials and a single configured demo destination.
It accepts no destination from a browser or teacher record. The 07:00 queue job
prepares eligible work; it does not dispatch calls. The protected dispatcher submits
at most one due call per invocation. The development-only manual demo queue action
is separate from dispatch; dispatch places a real, potentially chargeable call.

The `/follow-up-calls` page shows the configured development teacher's own queued and
provider-submission records plus observations awaiting teacher review. It deliberately
distinguishes `provider_accepted` from ringing, answering, or completion, and does not
render unverified provider callback states. The page is not protected by a production
login because teacher authentication is not implemented; it is unavailable in production.
An authorised-staff operations console is deferred until the application has an
authenticated staff role.

Caller ID alone is not proof of teacher identity. Authenticate the teacher through an approved challenge/context before associating a transcript with a learner. The voice call captures audio; the MVP sends it to OpenAI for transcription; Dira validates and persists teacher-confirmed observations through its existing flow.

The teacher-review persistence lifecycle is implemented separately from the
evidence-oriented `verification_status`: voice-originated observations can await
review as `recorded`, then become `confirmed` or `updated`. Original wording and
review edits are retained in PostgreSQL review history. Compact chat controls and
expanded learner-page controls are available in the development demo context only.
The OpenAI transcription request is implemented, but has not been verified against a configured OpenAI account. Africa's Talking recording delivery and download authentication must also be verified with the actual account before relying on the complete flow.

### Voice call lifecycle (implemented, provider contract unverified)

Queue item → `teacher_calls` (provider `sessionId`) → `call_recordings` → OpenAI
transcript → agent calls MCP tool `save_call_observation_drafts` →
`observation_drafts` → teacher confirms at `/call-drafts` (calls `log_observation`).

- The voice-instructions XML puts `<Say>` inside `<Record>`, with the protected
  recording callback URL on `<Record callbackUrl>`. The recording callback replies
  with XML while the call is active and an empty `<Response>` when inactive. This
  follows the supplied partial-recording contract; a real call still needs to verify
  that the account invokes both callbacks and returns the expected form fields.
- Callback diagnostics report status, content type, XML size, action presence, and
  non-sensitive callback metadata only. Do not share callback URLs containing the
  path secret, recordings, or transcripts when reporting a failure.
- Routes (set the secret as a path segment; the dashboard rejects `?token=`):
  `POST /api/voice/cb/<VOICE_CALLBACK_SECRET>/teacher-follow-up` (call instructions: greeting + `<Record>`),
  `.../recording` (set automatically in the `<Record callbackUrl>`), `.../events` (optional;
  the account shows N/A). Legacy `?token=` routes under `/api/voice/*` still work.
- Voice env: `AFRICASTALKING_USERNAME_VOICE`, `AFRICASTALKING_API_KEY_VOICE`,
  `AFRICASTALKING_VOICE_FROM`, always production endpoint. `DIRA_PUBLIC_BASE_URL` is the public origin.
- Workers: `npm run follow-up:queue` (07:00 prepare only), `follow-up:dispatch`
  (manual), `follow-up:recordings` (retry transcription/processing).
- Development UI: `/follow-up-calls` offers **Queue demo call now** only when demo mode
  and its explicit destination are configured. Queueing is idempotent and never calls
  by itself; the separate dispatch button submits a real, potentially chargeable call
  to that demo destination. It is disabled in production and does not create a calendar
  entry or relax the normal scheduled-call eligibility checks.
- Demo mode (`DIRA_DEMO_CALL_TEST_MODE`/`DIRA_VOICE_DEMO_MODE`) dials only the demo number and is
  flagged `is_demo`; real mode needs `teachers.phone_e164` and `voice_consent_at`.
- Unverified: OpenAI account/key availability, recording download auth, `/call` response shape, and live callback behavior.
- Learner matching is deterministic; ambiguous or unknown names stay `needs_learner`.

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
- `OPENAI_API_KEY` for MVP transcription and optional `OPENAI_STT_MODEL`. Replace OpenAI with a security-reviewed, self-hosted open-weight model before go-live.
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
