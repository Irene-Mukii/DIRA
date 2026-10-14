# Dira — Integrations

> **Important:** Selected, configured, tested and working are different states. Statuses below reflect repository evidence and the 2026-10-14 audit; they do not certify production operation.

## 1. Integration overview

| Integration                 | Interface                                          | Current implementation and verification status                                                                                                                                                    |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GLM-5.3 Flash via Z.AI      | Hosted model API, not MCP                          | `lib/models.ts` sends requests with timeout/error handling and captures usage when returned. Mocked request/usage and cost tests passed; no live request or provider billing comparison was made. |
| PostgreSQL                  | Server-side database                               | Used by persistence, audit and cache services. The focused suite uses mocks; database-backed tests and run reconstruction were not executed in this audit.                                        |
| OpenAI Audio Transcriptions | Hosted HTTPS API, not MCP                          | Transcription client and call-recording path are implemented. No live account request was made; this remains an MVP privacy exception requiring review before go-live.                            |
| Africa's Talking SMS        | Hosted API, not MCP                                | Not implemented in the current application path. `lib/external-mcp/sms.ts` contains only a comment and there is no SMS call site.                                                                 |
| Africa's Talking Voice      | Hosted API/SDK, not MCP                            | Request, queue, callback, recording and transcript-processing code exists; mocked demo/config tests passed. No live call, callback or recording download was verified. Calls can be chargeable.   |
| Keeper.sh calendar          | Borrowed external MCP server                       | Endpoint/client/helper code exists, but the calendar helpers have no application call site and no OAuth-backed invocation is configured. The borrowed-MCP requirement is not met.                 |
| Education-source retrieval  | Dira service: direct HTTPS plus optional Fetch MCP | Bounded direct retrieval is implemented; Fetch MCP is an optional stdio backend, disabled by default. Mocked retrieval/cache tests passed; no live source or Fetch MCP request was made.          |
| Deployment/hosting          | Platform                                           | No hosting deployment was verified in this audit. A planning document's provider choice is not evidence of an operational deployment.                                                             |

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

**Current status:** generic SDK transport and calendar helper code are present,
but a repository-wide call-site check found no application workflow that
invokes the Keeper helpers. Dira also has no configured OAuth provider/token
persistence for a teacher's calendar. No live discovery or call was made.
Keeper is therefore **selected but not integrated**, and the borrowed-MCP
requirement remains unmet until an authenticated invocation is implemented and
demonstrated.

### Correct use in Dira

Calendar event/time data may inform the timing of follow-ups or weekly planning. It does not prove that the class happened, that the teacher made the call, or that a learner attended. Test completion and learner observations must come from an explicit teacher-reported action and be recorded through Dira's observation workflow.

## 3. Educational-source retrieval

The implementation is in `lib/services/education-retrieval.ts`, behind the
Dira-owned `retrieve_education_resources` MCP tool. It performs bounded direct
HTTPS retrieval from configured IB, EEF, AMI and WWC domains, validates allowed
domains and redirects, bounds response sizes and page counts, and returns
per-source status/error metadata. The Suggest Test graph requests retrieval
only after it has enough eligible learner evidence to proceed. Learner names
and observation text are not part of the query.

The `lib/services/fetch-mcp.ts` adapter uses the installed MCP SDK 1.32.1 and
supports stdio (the local default) or authenticated Streamable HTTP. The
Render-side Docker service in `fetch-mcp-server/` runs the pinned official
Fetch package over stdio and exposes only its `fetch` tool over HTTPS with
bearer authentication. Dira's remote configuration is server-side:
`FETCH_MCP_TRANSPORT=http`, `FETCH_MCP_URL`, and `FETCH_MCP_TOKEN`; remote mode
rejects missing credentials and non-HTTPS endpoints. Deployment is not
verified until the Render service is deployed and the separate opt-in real
remote integration test passes.

PostgreSQL Markdown cache entries are size-validated, keyed by source and
canonical URL, and fresh for 14 days. A failed Fetch refresh can fall back to
Dira's validated direct result; Fetch failure remains independently recorded
as a failed `fetch_request` event and is correlated across Dira and Render
logs. Fetch connection, tool discovery, and request timeouts are bounded;
these are implementation constants, not a configurable retrieval SLA.

**Verification status:** focused mocked tests for source validation,
source-specific failure, Fetch fallback, cache freshness, size and hashes
passed. The opt-in Fetch MCP/PostgreSQL integration test was skipped, and no
live source request was made during this audit. Existing EVALS text records a
previous live retrieval report, but its raw command output was not retained in
the repository and it was not repeated; treat those reported source failures
as unverified historical evidence.

This retrieval integration is distinct from the borrowed Keeper calendar MCP.
It does not by itself satisfy a requirement to connect to a third-party
calendar MCP server.

## 4. Speech-to-text (MVP: OpenAI; replace before go-live)

### In-app voice flow

`Africa's Talking recording → server-side download → OpenAI Audio Transcriptions API → transcript → DIRA agent drafts → teacher review → PostgreSQL`.

The implementation uses `POST https://api.openai.com/v1/audio/transcriptions` with `OPENAI_API_KEY` and defaults to model `gpt-transcribe` (override with optional `OPENAI_STT_MODEL`). It expects a JSON `text` result. The current API guide lists a 25 MB maximum and MP3, MP4, MPEG, MPGA, M4A, WAV and WebM input. The server rejects unsupported types and files above the limit rather than fabricating or silently altering a transcript.

**MVP-only security exception:** this sends teacher recordings that may contain learner information to OpenAI. Do not use this as the go-live transcription architecture. Before go-live, replace it with a security-reviewed, self-hosted open-weight transcription model in infrastructure DIRA controls, and verify data handling, access controls, retention and accuracy. Never expose the API key to browser code or logs.

### Failures

An OpenAI timeout/unavailability must not produce a fake transcript or a saved observation. Failures are recorded and retried within the existing attempt limit; retries must not duplicate drafts. The transcription provider name is stored with the transcript and copied to a confirmed observation.

## 5. Africa's Talking SMS

SMS is not implemented in the current application path. The
`lib/external-mcp/sms.ts` file contains only a comment and no call site sends
messages. If SMS is added later, use the ordinary Africa's Talking API unless
a specific MCP server is independently verified; keep messages short and do
not show delivery success without the provider's response or a delivery
callback.

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

`lib/models.ts` calls the Z.AI chat-completions API using the server-side
`ZAI_API_KEY` and `glm-5.3-flash` model identifier. Requests have a 75-second
timeout and validate the returned completion/tool-call shape; Suggest Test and
Evidence Card services apply their own output and evidence-reference checks.
Mocked tests verified request options, token extraction, network-error
reporting, and cost calculation. No live provider request, account/quota check,
or invoice comparison was performed during this audit. Do not assume the model
provides web search or browsing.

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
