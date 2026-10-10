# Implementation Plan: Calendar-Aware Teacher Follow-up Calls

## Purpose

Build and test a workflow that checks a teacher's scheduled class in Dira's PostgreSQL
school calendar, then calls the teacher **after the scheduled class ends**. For
example, a class scheduled from 8:00 to 9:00 becomes eligible for a call at 9:00, not
during the lesson.

This plan assumes the call invites the teacher to report a brief learner observation
by phone, which can be reviewed and saved through Dira's existing observation flow.
Confirm this call purpose before implementation. If the call is only a reminder, the
recording and transcription phase can be omitted.

## Agreed behavior and key design boundaries

- Do not place the outbound call while the teacher is scheduled to be teaching.
- Use the scheduled end time as the earliest call time. The implementation must apply
  the school's timezone and handle events that are cancelled, changed, overlapping, or
  missing an unambiguous end time.
- PostgreSQL is the recommended authoritative source for Dira's school timetable and
  dated class schedule. The current schema already has `timetable_assignments` and
  `school_calendar`; those records can schedule and queue class-end follow-ups without
  first copying every lesson into a teacher's work-email calendar.
- Keeper.sh remains the selected **borrowed calendar MCP server**. Dira must connect
  and discover/invoke real calendar tools using MCP; a direct calendar-provider API
  call does not satisfy that requirement. Use Keeper for teacher-calendar context
  (for example, checking for a conflicting appointment) only if the discovered tools
  and product rules support it. Do not make Keeper a second source of truth for the
  school's class timetable.
- Creating or updating events in teachers' work calendars is **not part of the
  recommended MVP**. Consider a later, explicit one-way sync only if teachers need
  those events visible in their email calendar; first verify that Keeper exposes
  calendar-write tools and define idempotent create/update/cancel behavior.
- The existing Dira architecture still selects Keeper as its borrowed MCP integration.
  A real, bounded Keeper MCP call can be demonstrated separately or used for a useful
  teacher-availability check; it is not required to calculate class end-times when
  PostgreSQL already contains the schedule.
- Africa's Talking is the selected **outbound voice API**, not a verified MCP server.
  Use its server-side API unless a genuine, usable Africa's Talking Voice MCP server is
  independently verified. Do not label an ordinary API adapter as MCP.
- Africa's Talking initiates and manages the call. Whissle is the selected
  speech-to-text service. Do not assume the voice provider automatically returns a
  Dira-ready transcript.
- A calendar event can establish timing context only. It cannot prove that a lesson
  took place, that a learner attended, or that an observation is true.
- Do not attach a transcript to a learner until the demo teacher explicitly
  identifies/confirms the learner. Production additionally requires the teacher's
  identity to come from a verified authenticated session.
- The existing observation workflow remains the persistence path. The teacher's
  original words, transcript, recording reference, and review status must remain
  distinguishable.
- Call scheduling is based on the teacher assigned to the PostgreSQL schedule, not
  whether that teacher is logged into Dira when the job runs. When the teacher next
  logs in, show the call outcome in their chat/activity history.
- For the demo, use the user-provided test number only as a server-side local
  configuration value in an ignored `.env.local`; do not put the literal number in
  this tracked plan, source code, `.env.example`, browser code, or logs. Test mode must
  be explicitly enabled and limited to that approved destination before any call can
  be placed.
- Run the daily queue-preparation job at 7:00 a.m. in the school's timezone on
  weekdays only, and skip school holidays. The job prepares that day's due calls;
  each call is dispatched no earlier than the assigned class's scheduled end time.
- Phone-captured observations are saved with a separate teacher-review status:
  `recorded` (saved, awaiting teacher review), `confirmed` (teacher accepted as-is),
  or `updated` (teacher edited and saved). This is distinct from the existing
  evidence-oriented `verification_status` in the observations schema. The compact
  chat view offers confirm/edit actions for `recorded` items; `/learners/[id]` offers
  fuller controls, including observation type and linking to a suggested test.
- At the start of a call, the agent uses the agreed teacher-facing prompt: “Hello
  teacher, please share remarks you have for one or more of your focus group of the
  week. Make sure to state the name of the child you are talking about before each
  of their observations. You may begin.”
- Provider, calendar, scheduler, authentication, transcription, or persistence errors
  must be visible; none may be represented as a successful call or saved observation.

## Current state (from repository inspection)

| Capability | Current assessment | Evidence / implication |
|---|---|---|
| Teacher/class schedule model | **Implemented but not verified end-to-end** | `lib/db/dataset_schema.sql` defines recurring `timetable_assignments` and dated `school_calendar` periods with start/end times and teacher context. These can be the source for due jobs; verify the actual local database state before relying on it. |
| Calendar MCP client | **Partially implemented** | `lib/agent/mcp-client.ts` provides a server-only Streamable HTTP client with OAuth-provider injection; `lib/external-mcp/calendar.ts` provides bounded, read-only Keeper tool adapters. Dira still has no OAuth callback/session persistence, and the hosted endpoint has not been reached or verified from this environment. |
| Dira MCP server and scheduled agent | **Demo implementation added; pending runtime verification** | `/api/mcp/server` exposes the Dira tools over stateless Streamable HTTP with a server-side bearer token. `/api/internal/follow-up-agent` wakes a bounded agent that uses the Dira MCP client. A hosting scheduler is not selected or configured. |
| GLM-5.3 model client | **Implemented; credentials still need configuration** | `lib/models.ts` calls the official Z.AI GLM-5.3 chat-completions API. `.env.example` documents an empty `ZAI_API_KEY`; no credential values were inspected or copied. |
| Outbound voice | **Partially implemented** | `lib/external-mcp/voice.ts` submits a server-side Africa's Talking call request with bounded timeout and sanitized outcomes. Credentials/account capability and any live call remain unverified. |
| Speech transcription | **Not implemented** | `lib/external-mcp/stt.ts` describes Whissle as MCP and its methods return empty strings. `lib/services/transcription.ts` supplies an interface/adapter pattern, not a provider integration. |
| Observation persistence/review | **Text workflow implemented; review lifecycle partly implemented** | Reuses `log_observation`; separate voice-review state/history and teacher controls exist in development. Actual phone audio/transcription ingestion and production teacher authentication remain unimplemented. |
| Call lifecycle and scheduler | **Partially implemented** | Protected queue and due-dispatch triggers, durable status transitions, demo-only destination gating, and a static call greeting exist. No external scheduler is configured; status callbacks, teacher authentication/consent, active database migration, and live calls remain unverified. |

“Selected” providers and schema definitions do not mean the integration has been
configured or successfully executed. Promote each status only after its acceptance
tests pass in the named environment.

## Phase 0 and Phase 1 implementation status (10 October 2026)

- **Phase 0 — partially complete:** The current Keeper repository README was checked.
  It describes hosted OAuth 2.1 and read tools including `list_calendars`,
  `get_event_count`, `get_events`, `get_event`, and `find_free_time`; it also lists
  write/sync tools. Do not assume that those tools, account limits, or scopes are
  enabled for the actual hosted account until live discovery confirms them.
- The demo destination and explicit test-mode flag are stored only in the ignored
  developer `.env.local`. The number is intentionally absent from tracked files.
  Provider credentials and caller ID still need explicit local configuration; the
  call adapter independently enforces the demo destination before HTTP submission.
- **Still blocked in Phase 0:** no Keeper OAuth session/calendar is configured in
  Dira; no live Africa's Talking or Whissle account capability has been verified;
  the new timezone and closure structures still need authoritative values configured
  for the development school. No live calls or authenticated calendar requests were
  made.
- **Phase 1 — client foundation implemented, end-to-end verification blocked:** the
  official MCP SDK dependency, server-only Streamable HTTP client, OAuth-provider
  injection point, discovery, and bounded read-only Keeper tool adapters are now in
  the codebase. `KEEPER_MCP_URL` is documented in `.env.example`.
- The app's production build and TypeScript checks pass with the new client. A
  non-destructive unauthenticated handshake could not reach the hosted endpoint from
  this environment, so no live network-level tool discovery or invocation is claimed.
- Dira does not yet implement OAuth callback/session persistence or connect Keeper
  authorization to an authenticated teacher account. Do not store Keeper tokens in
  plain `.env.local` or share one teacher's calendar credentials across teachers.
  A real authenticated MCP invocation remains pending a secure authorization/session
  design and a non-sensitive test calendar.

## Phase 2 implementation status (10 October 2026)

- **Queue foundation implemented; operational verification pending:**
  `lib/services/follow-up-queue.ts` resolves today's local date per school, skips
  weekends, requires confirmed closure-calendar coverage, validates dated periods
  against recurring teacher assignments, rejects overlapping periods, and
  transactionally upserts idempotent queue rows.
- `db/002_follow_up_queue.sql` is an additive migration for existing development
  databases; `lib/db/dataset_schema.sql` includes the same structures for a fresh
  database. The migration has not been applied to the active Docker database.
- `POST /api/internal/follow-up-queue` is a bearer-secret-protected manual/cron
  trigger. A hosting scheduler still needs to invoke it daily at 7:00 a.m. in the
  school's timezone. No production scheduler is configured by this code change.
- A school without a valid timezone or confirmed closure coverage is explicitly
  reported as blocked; the queue does not guess that a school is open. Configure
  `schools.timezone`, populate `school_closures`, and confirm coverage in
  `school_closure_coverage` before expecting queue rows.
- The queue stores eligibility and scheduled class-end time only. It does not call
  teachers, persist provider call outcomes, or enforce the demo destination; those
  were left to Phase 3. Keeper availability is not queried because PostgreSQL is the
  authoritative class schedule and no work-calendar conflict policy was approved.

## Phase 3 implementation status (10 October 2026)

- **Call submission foundation implemented; live provider workflow blocked/unverified:**
  `lib/external-mcp/voice.ts` sends a URL-encoded request to the Africa's Talking
  Voice endpoint using server-side credentials, a timeout, and a non-sensitive
  request ID. A successful HTTP response records only `provider_accepted`; it does
  not claim the teacher answered or that a recording exists.
- `lib/services/follow-up-dispatch.ts` revalidates the scheduled period, closure
  coverage, current teacher schedule, school-local date, and due time; it atomically
  claims one job per invocation. Calls are possible only in non-production when
  `DIRA_DEMO_CALL_TEST_MODE=true` and the destination is the locally configured
  `DIRA_DEMO_CALL_TO`. The demo number is never read from the request or teacher
  profile and is not included in responses/logs.
- `app/api/internal/follow-up-dispatch` requires the scheduler bearer secret.
  `app/api/voice/teacher-follow-up` returns the agreed static greeting for the
  Africa's Talking voice callback; audio recording, transcription, persistence, and
  teacher review remain Phase 4.
- `db/003_voice_call_lifecycle.sql` adds provider submission states and safe call
  request metadata. It has not been applied to the active Docker database. Compose
  mounts it for fresh database initialization only; do not reset an existing volume.
- **Still blocked:** the Africa's Talking account, credentials, caller ID, and
  sandbox/live behavior have not been verified; no provider callback/result
  authentication or event processing is implemented; no teacher login identity,
  verified contact/consent, opt-out, quiet hours, or outcome UI is connected.
  Production dispatch is intentionally disabled until those controls exist.
- A 200/201 response follows the official Node SDK's documented successful-submit
  statuses. Other successful HTTP codes are treated as unknown, not as a placed
  call. The voice response URL must be configured and tested with the provider
  account; Dira cannot yet verify that account-side configuration.
- No call was made. The hosted scheduler must be configured explicitly and should
  only be enabled after the migrations and a controlled demo are verified.

## Phase 4 implementation status

- **Teacher-review persistence and controls implemented; phone capture/transcription
  still blocked:** observation rows now have a distinct `teacher_review_status`
  (`not_required`, `recorded`, `confirmed`, `updated`) rather than overloading
  evidence `verification_status`. Voice-captured observations enter `recorded`.
- The new review service only permits a pending observation to transition once,
  checks the reviewer belongs to the observation's school, validates suggested-test
  ownership, and records the prior/current wording and metadata in
  `observation_review_history`. The original observation wording is not overwritten.
  Replayed review submissions use an idempotency key.
- The chat view has compact confirm/edit actions. The learner detail page has
  expanded edit controls for observation type and optional suggested-test linking.
  Review routes currently rely on the same non-production demo teacher context as
  existing observation routes; real authenticated teacher sessions are not wired.
- `db/004_observation_teacher_review.sql` is additive and is mounted for fresh
  database initialization. It has **not** been applied to the active Docker database.
- **Not implemented/verified:** the current Africa's Talking callback only plays the
  greeting; no audio is recorded or fetched. The Whissle adapter remains a placeholder
  and no official account-specific endpoint, audio contract, callback, consent, or
  retention behavior has been verified. Therefore this phase does not yet produce
  phone transcripts or claim a working voice-to-observation end-to-end flow.

## Phase 5 implementation status

- **Teacher-facing demo status view implemented; production identity and call outcomes
  remain blocked:** `/follow-up-calls` shows queue/provider-submission states and the
  next safe action, with rows filtered server-side by the configured development
  teacher and school. It also lists that teacher's `recorded` observations separately
  and links to their learner records for review.
- The view is linked from desktop and mobile navigation. It intentionally says that
  the development teacher ID is not an authenticated login. Production renders an
  unavailable message until a real teacher session is wired.
- The current provider lifecycle only supports queued, initiating, provider-accepted,
  provider-rejected, outcome-unknown, and cancelled. The UI does not claim that an
  accepted request rang, was answered, or completed. Missed/declined/completed states
  require authenticated provider callbacks and are not implemented.
- A separate authorised-staff operational console is **not implemented** because
  Dira has no staff role/authentication model. The current page exposes only the
  configured demo teacher's operational summary and redacts unknown error codes to
  a generic message.
- **End-to-end verification remains blocked:** no real login, external scheduler,
  Africa's Talking callback, recording flow, Whissle transcription, or production
  teacher authorization is connected. These are integration blockers, not passing
  tests.

## Phase 6 — Complete the scheduled-call-to-reviewed-observation journey

**Goal:** Complete and manually verify the agreed user journey: Dira prepares
schedule-based follow-ups; a timer wakes Dira's bounded agent; the agent uses
Dira's own MCP tools to inspect and progress eligible work; after class ends, an
approved call is submitted; audio is transcribed using a verified service; the
teacher identifies the learner and reviews the transcript; Dira saves exactly one
observation and later shows truthful outcomes.

This phase is deliberately gated. **Do not enable automatic or live calling** until
the relevant database, consent, provider, callback, and destination controls have
passed their preceding checks. The first end-to-end demo does not require a login
system: a server-side demo identity resolver will consistently select one
deterministic teacher record and will be replaceable with a verified-session
resolver later. The demo must remain single-teacher and demo-destination gated.
Africa's Talking is currently treated as an ordinary Voice API, not an MCP server. Public official
Africa's Talking materials checked for this plan document Voice API/SDK usage; no
public first-party Africa's Talking Voice MCP server was found. This is not proof
that no private or unpublished server exists. The official Node SDK documents call
submission through the Voice `/call` API. Route calls through Dira's server-side
provider adapter unless a genuine first-party or third-party AT MCP server is
independently verified and deliberately selected.

Dira's own MCP server is a separate, Dira-owned surface: it exposes approved Dira
capabilities as tools to connected MCP clients. The scheduled Dira agent will use
Dira's MCP client to call that server, so queue preparation, due-work inspection,
dispatch, and observation logging share the same validated tools. The MCP server
and its tools must not make the LLM authoritative for time, eligibility, identity,
idempotency, or call-safety decisions.

### Phase 6.1 — Prepare and manually verify the development database

**Likely files:** `db/002_follow_up_queue.sql`,
`db/003_voice_call_lifecycle.sql`, `db/004_observation_teacher_review.sql`,
`compose.yaml`, `IMPLEMENTATION_PLAN.md`.

- Confirm the target database and take a recoverable backup/snapshot before
  migration. Do not delete or recreate the existing Docker volume as a migration
  shortcut.
- Apply the additive migrations in order: Phase 2 queue, Phase 3 call lifecycle,
  then Phase 4 teacher-review lifecycle. Compose initialization mounts do not apply
  migrations to an already-initialized PostgreSQL volume.
- Verify required schema versions, school timezone, dated schedule entries,
  confirmed closure coverage, and closure dates using synthetic/demo data.
- Rehearse the protected queue endpoint manually. Confirm it queues eligible
  weekday/non-holiday periods once, and blocks with a visible explanation when
  timezone or closure coverage is missing.
- Rehearse the protected dispatch endpoint with provider submission mocked first.
  Confirm it cannot claim before the scheduled end, claims at most one eligible
  job per request, respects the demo destination gate, and records accepted,
  rejected, and unknown outcomes accurately.
- Keep provider credentials and scheduler secrets in ignored local environment
  configuration. Never paste or log their values.

**Gate:** Do not proceed to automatic dispatch until migrations and the manual
queue/dispatch checks pass. No migration is applied by this plan.

### Phase 6.2 — Add a bounded Dira MCP server and scheduled agent

**Dependencies:** Phase 6.1; verify the existing model configuration contract from
tracked environment examples and server-side model code before wiring the agent.

- Implement Dira's MCP server surface and expose the relevant existing capabilities
  as typed, validated tools, including queue preparation, due-follow-up inspection,
  one-job dispatch, and `log_observation`. Reuse the existing service/tool
  implementations; do not duplicate schedule, dispatch, or observation rules in
  MCP handlers.
- Define and document each tool's input/output schema, server-side authorization,
  error behavior, and idempotency. Keep call dispatch behind existing demo-mode,
  destination, schedule, and atomic-claim checks. Do not expose provider credentials
  or allow a caller to select an arbitrary recipient.
- Protect the deployed demo MCP endpoint with its own server-side bearer credential;
  never ship that credential to browser code. This shared demo credential is not
  production-grade per-user authentication or multi-school authorization.
- Add a bounded agent loop that uses Dira's MCP client to connect to Dira's own MCP
  server, discovers the permitted tools, requests the next action, and incorporates
  tool results. The agent may coordinate and report; Dira code remains authoritative
  for dates, closures, eligibility, conflicts, deduplication, teacher context, and
  dispatch safety.
- Use the project's intended GLM-5.3 hosted model configuration. Inspect only
  tracked `.env.example`/configuration documentation and model-provider code to
  determine variable names and base URL/model settings; never copy, print, log, or
  commit values from `.env` or `.env.local`. Add safe empty placeholders and clear
  setup guidance to `.env.example` only if required. Missing credentials or model
  configuration must produce a visible error; do not silently use another model.
- The queue-preparation scheduler trigger wakes the Dira agent at 7:00 a.m. on
  eligible weekdays; a separate bounded due-dispatch trigger wakes it at/after class
  end times. Neither trigger runs queue/dispatch business logic directly. Each sends
  only its event kind and time context; the agent uses MCP tools to prepare the
  queue or inspect and request dispatch of due work. A timer does not make the LLM
  responsible for keeping time or deciding authoritative eligibility.
- Choose the smallest hosting-compatible trigger supported by the deployment. Keep
  the trigger authenticated and idempotent, with non-overlap, bounded execution,
  monitoring, and alerting. The trigger may invoke a protected Dira agent-run route;
  that route must start the agent and return a truthful run result.
- Keep the demo teacher selection behind one server-side identity-resolver
  interface. Its demo implementation deterministically selects the first recorded
  teacher using an explicit stable ordering and fails visibly if none exists.
  Never trust a teacher ID supplied by the model, MCP caller, or browser. Later
  authentication should replace the resolver implementation rather than require
  changing each tool, service, and page.
- The scheduled agent may use queue-preparation, due-inspection, and dispatch tools,
  but must not use `log_observation` to invent a transcript. Observation logging is
  available only when actual teacher-provided content and an explicitly selected
  learner are supplied.
- Do not implement production login/contact verification as part of this demo slice.
  Use the deterministic first-teacher demo resolver and approved demo call number.
  Preserve recording notice/consent and privacy safeguards before any recording;
  a fixed demo identity is not proof of a real person's identity or consent.

**Gate:** Demonstrate a scheduler-triggered agent run using GLM-5.3, Dira's MCP
client, and Dira's own tools against a no-call/mock provider.
Prove that it can prepare work, inspect results, request a guarded dispatch, report
tool failures honestly, and cannot create duplicate jobs or bypass server-side
eligibility. Only then enable a controlled test call after applicable consent and
provider capability checks pass.

### Phase 6.3 — Verify Africa's Talking Voice lifecycle callbacks

**Dependencies:** Africa's Talking account capability and current callback/security
documentation verified; Phase 6.2 tool authorization and demo call-safety controls.

- Confirm account-side support for the outbound request, voice response URL, status
  callbacks, and the sandbox/test destination. The currently implemented `voice.ts`
  submits the direct Voice API request; it records provider request acceptance
  only.
- Configure a public HTTPS callback endpoint with the exact callback semantics,
  request method, fields, and authentication or verification mechanism supported by
  the account. Do not assume a signing-header format or undocumented parameters.
- Model and persist only states supported by provider/application evidence, such as
  initiated, ringing, answered, no-answer/busy, completed, or failed. Keep
  `provider_accepted` distinct from all call-progress and final outcomes.
- Validate callback source/authentication, schema, provider request/call ID,
  allowed state transitions, timestamps, duplicate delivery, and replay. Make each
  callback idempotent and reject unrelated or mismatched IDs.
- Ensure retries are limited to explicitly known retryable states; an unknown
  provider result must be reconciled rather than blindly sent again.
- Test callback failures and malformed/forged/duplicate callbacks with fixtures.
  Show final call results to the assigned teacher only after successful
  authorization.

**Gate:** Do not display missed, answered, or completed states until a controlled
provider test confirms the corresponding authenticated callback in the deployed
environment.

### Phase 6.4 — Capture audio and verify Whissle transcription

**Dependencies:** verified recording/audio capability and callback flow in Phase
6.3; approved consent and retention policy.

- Establish from Africa's Talking's actual account/documentation how the voice flow
  records audio, obtains the recording reference or audio, signals recording
  completion, and secures retrieval. Do not infer a recording from a completed
  call.
- Verify Whissle's actual API, endpoint, authentication, audio formats and limits,
  response schema, error behavior, and retention terms against official/account
  documentation. The current `lib/external-mcp/stt.ts` is a placeholder and returns
  empty strings; do not send real audio to it or describe it as a working MCP.
- If either provider does not support the needed capability, stop and agree a
  provider-compatible alternate capture/transcription design before implementation.
- Implement a server-side, size/duration-limited audio handoff. Keep the recording
  reference separate from transcript text; restrict access, avoid ordinary logs,
  and apply the approved retention/deletion policy.
- Persist transcription lifecycle and safe errors. Empty, invalid, timed-out, or
  unsupported audio must not create an observation or a fabricated transcript.
- Preserve the original transcript and any provider metadata actually returned;
  never invent confidence scores or learner identity.

**Gate:** Verify a test recording and a real Whissle test transcript/error response
using synthetic or explicitly consented test audio before connecting the flow to
learner records.

### Phase 6.5 — Join transcript review to the existing observation path

**Dependencies:** Phase 6.2 tool wiring and Phases 6.3–6.4.

- Associate audio/transcript first with the server-resolved demo teacher and call
  attempt, not a learner inferred from caller ID, timetable, or automatic name
  matching. In production, the same boundary will resolve the verified teacher
  from the authenticated session.
- Require the teacher to explicitly select/confirm the learner for each observation.
  If identity is unclear, retain it as an unlinked follow-up for the teacher; do not
  force an observation row because the current `log_observation` input requires a
  learner ID.
- Pass an explicitly confirmed learner, original transcript, phone-capture
  provenance, permitted recording reference, and deterministic call/recording
  submission ID through the existing `log_observation` persistence path. Do not
  add a parallel observation write path.
- Save only usable, attributable transcripts as `recorded`. Keep the original
  transcript separate from a teacher edit; preserve the existing review history and
  `recorded` -> `confirmed`/`updated` transitions.
- Show the teacher clear call status and next action in Follow-up Activity, and
  route pending review to the correct learner record. Keep call outcome, transcription
  status, teacher-review status, and evidence verification status separate.

### Phase 6.6 — End-to-end manual acceptance and operational handoff

- With synthetic schedule data, manually demonstrate: scheduler trigger -> bounded
  GLM-powered Dira agent -> Dira MCP client -> Dira MCP server tools -> queue
  preparation and inspection -> class-end eligibility -> single guarded dispatch ->
  provider request -> verified callback -> deterministic demo-teacher context and
  consent -> recording -> transcription -> explicit learner confirmation -> exactly
  one `recorded` observation -> teacher confirmation or edit -> status visible in the
  demo teacher context.
- Repeat with weekend/holiday, cancelled or changed schedule, early dispatch,
  overlapping class, scheduler duplication, provider rejection, unknown provider
  result, missed call, teacher refusal, invalid callback, callback replay, recording
  failure, Whissle timeout/empty response, unclear learner, duplicate transcript,
  unauthorized MCP caller, and database outage.
- Verify no failure path creates fake success, a guessed learner link, or a duplicate
  call/observation. Verify no audio, transcript, phone number, credential, or
  unnecessary learner text appears in logs.
- Record environment, migration versions, code revision, expected/actual outcomes,
  and unresolved blockers in the evaluation record. Mark each integration as
  selected/configured/smoke-tested/end-to-end-tested only when its own evidence
  supports that status.
- Do not claim the demo journey works if any required provider capability, demo
  identity resolution, consent, scheduler-to-agent trigger, MCP tool, or callback
  step remains blocked. Production login and multi-teacher authorization remain
  explicitly deferred and must not be implied by a successful single-teacher demo.

## Should Dira write school periods to teachers' work calendars?

**Recommendation: not for the call-scheduling MVP.** Dira already has recurring
teacher/class assignments and dated school periods in PostgreSQL. A due job can be
created from those records and dispatched at the class end; copying those periods to
an email calendar adds no scheduling information Dira lacks.

| Option | What it provides | Cost / risk | Recommendation |
|---|---|---|---|
| Schedule from PostgreSQL | Uses Dira's assigned teacher, class, date, and period end-time directly; supports a durable, idempotent call queue. | Requires a trustworthy school timezone and a reliable job runner. | **Use for MVP.** Keep PostgreSQL authoritative. |
| Also create work-calendar events through Keeper | Shows the school timetable in the teacher's familiar email calendar and may make external conflicts visible. | Requires verified calendar-write tools and scopes, account linking, duplicate prevention, update/cancel synchronization, handling teacher edits, and recovery when either system is unavailable. This creates a second representation that can drift. | Defer unless teachers explicitly need calendar visibility. If added later, sync one-way from PostgreSQL; do not schedule calls from the mirrored copy. |
| Read work-calendar availability through Keeper | Can help avoid calling during a separate appointment not represented in the school timetable. | Requires permission, correct account-to-teacher mapping, a meaningful busy/free tool, rate-limit management, and a policy for unavailable/conflicting results. | Optional; add only if avoiding non-school appointments is a confirmed requirement. |

Keeper is the calendar **MCP connection**, not the call queue or source of truth.
The team can meet the borrowed-MCP integration goal with a real bounded read-only
Keeper tool call; event creation is a separate capability and must not be assumed
until discovered and verified.

## Target end-to-end flow

1. Dira reads the dated class period from PostgreSQL `school_calendar`, joined to the
   teacher's `timetable_assignments` and school/class records. The school timezone
   must be configured or otherwise reliably available; the current schedule columns
   store local date and clock times, not an explicit timezone.
2. A queue-preparation scheduler trigger alerts Dira's agent at 7:00 a.m. on
   eligible weekdays. A separate due-dispatch trigger alerts it at/after class end
   times. The agent uses Dira's MCP client to call Dira's MCP server tools; neither
   trigger invokes queue or dispatch business logic directly. The queue-preparation
   tool reads the school's holiday/closure data and queues eligible calls for that
   day's dated class periods. The actual call job is due at each assigned class's
   end (for an 8:00–9:00 lesson, at 9:00). Weekend and holiday dates produce no call
   jobs. A calendar event need not be copied into the teacher's work email for this
   database-backed queue to operate.
3. If product policy requires avoiding personal appointments or other calendar
    conflicts, Dira may make a bounded, read-only Keeper MCP request for the teacher's
    relevant availability. Map the authorised calendar to the teacher; request only
    the minimum time window and data, and defer when availability cannot be checked
    according to the agreed policy. Keeper's calendar is not used to replace or
    silently override the PostgreSQL class schedule.
4. Before dispatch, Dira rechecks the relevant PostgreSQL schedule and any required
    Keeper availability, then verifies that the class has ended, the job is eligible,
    it has not already been handled, and no configured no-call rule or subsequent
    scheduled class prevents the call. Do not poll Keeper every minute per teacher;
    use bounded lookups and respect its limits.
5. The server-side Africa's Talking adapter places the call and records the provider
    request/call ID and real status. Webhooks are authenticated/validated and update
    the same call attempt idempotently.
6. For the single-teacher demo, server-side code resolves the demo teacher
    deterministically; no login or claim of real identity verification is made. The
    call explains its purpose and recording/transcription practices and obtains any
    required recording consent before recording. Production will replace that
    resolver with identity from a verified authenticated session. It opens with:
    “Hello teacher, please share
    remarks you have for one or more of your focus group of the week. Make sure to
    state the name of the child you are talking about before each of their
    observations. You may begin.” If consent is refused, do not record or save
    learner observations.
7. If provider capabilities permit audio retrieval/recording, Dira securely obtains
    the audio and submits it to Whissle using Whissle's documented audio contract.
    Dira presents the transcript to the teacher for review; uncertainty about learner
    identity, negation, numbers, or material facts requires correction/confirmation.
8. Dira resolves and validates each named learner against the demo teacher's
    authorised focus group (and, in production, the authenticated teacher's focus
    group). It saves a usable, attributable transcript through the
    existing observation persistence path with trusted teacher context, phone capture
    provenance, transcript/recording references where permitted, and an idempotency
    key. The observation is marked `recorded` (saved but awaiting teacher review).
    Identity ambiguity or material transcription uncertainty is not silently guessed
    or presented as confirmed; keep it unlinked/in review until clarified.
9. In the demo, the fixed demo teacher context sees the call outcome (for example,
    rejected, missed, completed, or awaiting transcript review) in Follow-up Activity.
    In production, an authenticated teacher will see only their own history after
    login.
    Newly saved phone observations appear as compact entries marked `recorded`, with
    small confirm and edit icon actions. On `/learners/[id]`, the teacher can use
    fuller review controls, select an observation type, and optionally link the
    observation to a suggested test. Confirming changes review status to `confirmed`;
    editing and saving changes review status to `updated`, preserving the original
    transcript and recording the teacher's edit. Only an actual database write is
    described as saved.

## Implementation phases

### Phase 0 — Confirm product, consent, and provider feasibility (P0)

**Work**

- Confirm the phone prompt's purpose and the expected observation interaction
  (including whether the teacher is reporting about a learner from the just-finished
  class).
- Confirm the exact trigger rule: scheduled class end is the earliest call time;
  the queue-preparation job runs at 7:00 a.m. local school time on weekdays, skips
  holidays, and schedules each call no earlier than class end. Define any post-class
  delay, permitted call hours, how late/overlapping periods behave, and what happens
  when the schedule is stale.
- Confirm PostgreSQL `school_calendar` as the authoritative dated class schedule and
  `timetable_assignments` as the recurring teacher/class assignment. Configure the
  school's IANA timezone because the current SQL stores dates and local start/end
  times without a timezone column. For multi-school use, prefer storing timezone per
  school; a single-school development setup may use explicit server-side configuration
  until that field is added.
- Decide whether calls must avoid appointments on a teacher's work calendar.
  Recommended MVP: use PostgreSQL for class-end due times and call eligibility; add a
  read-only Keeper MCP availability check only if avoiding non-school calendar
  conflicts is a real requirement. Do not copy the timetable into work calendars
  merely to make a call queue.
- Treat writing school timetable events into teachers' work calendars as a separate,
  optional later feature. Verify Keeper's actual write tools and permissions before
  planning it. If needed, use PostgreSQL as the source of truth and define a one-way,
  idempotent sync for create/update/cancel; do not maintain two independently
  editable canonical schedules.
- Verify Keeper's current hosted/self-hosted setup, OAuth 2.1 flow, Streamable HTTP
  transport, actual tool names/schemas, supported calendar provider, and request
  limits.
- Verify the Africa's Talking account's outbound voice access, caller ID, supported
  IVR/recording or audio-retrieval flow, callback/webhook contract, regional
  restrictions, and recording-consent requirements.
- Verify Whissle account access, API contract, accepted audio formats/size/duration,
  response fields, and retention rules.
- Decide teacher phone-number ownership/verification, call frequency limits,
  opt-out, consent, retry policy, and audio/transcript retention. Do not use caller ID
  as the sole teacher authentication factor.
- Identify the authoritative weekly focus-group roster and how it is scoped to each
  scheduled teacher; do not derive learner identity from call audio or class
  membership alone.
- For the demo, configure the user-provided test phone only in the developer's ignored
  `.env.local` using a server-only variable (for example, a demo-call destination
  setting). Verify the file is ignored by Git before adding the value. Do not record
  the literal number in tracked files. Require explicit demo/test mode and reject
  destinations other than the approved test number; never let a test setting become
  a production recipient.
- Agree whether call audio is retained or deleted after transcription/review and who
  may access it.

**Dependencies:** Product owner, school operating rules, access to non-production
provider accounts and documentation.

**Acceptance criteria**

- Written decisions exist for all items above, including what happens on no answer,
  busy line, teacher opt-out, consent refusal, PostgreSQL schedule unavailability, a
  Keeper outage if its availability check is required, and conflicting schedules.
- A 7:00 a.m. local-time weekday queue run, explicit weekend exclusion, and
  authoritative school-holiday/closure source are defined. The current schema does not
  show a dedicated holiday/closure entity; determine whether existing school-calendar
  rows can represent full-school closures safely or whether a minimal explicit
  closure-date model is needed.
- The exact demo destination is configured only in ignored local environment state,
  with a test-mode gate and no literal number in the repository.
- A test Keeper calendar, Africa's Talking Voice account, and Whissle account (or
  explicit documented blockers) are available.
- No real teacher/learner data or live calls are used for initial integration tests.

### Phase 1 — Implement and prove Keeper calendar MCP (P0)

**Likely files:** `lib/agent/mcp-client.ts`,
`lib/external-mcp/calendar.ts`, server-side configuration documentation, focused
tests.

**Work**

- Implement the actual MCP transport and authentication needed by Keeper's verified
  configuration. Keep OAuth secrets server-side and use minimum read permissions
  required for the confirmed use case.
- Add initialization, capability/tool discovery, argument validation, request
  timeouts, cancellation where supported, structured errors, and safe operational
  logging.
- Discover tools from the running server; do not hardcode unverified names such as
  `list_calendars` or `get_events` until discovery confirms their schemas.
- Add a narrow calendar adapter for the confirmed use case. If only proving the
  borrowed MCP integration is required, perform a bounded read-only discovery/test
  call; if availability checking is approved, return only busy/free or the minimum
  conflict fields required. Do not use Keeper as the class schedule source, pass
  complete calendar contents to the model, or copy them into learner records.
- Do not implement calendar event creation or schedule mirroring in this phase. If
  later required, verify that Keeper exposes the necessary write tools, then scope a
  separate one-way sync with create/update/cancel idempotency and recovery.
- Make calendar unavailable/stale/permission-denied an explicit state. Do not fall
  back silently to a direct Google/Microsoft/etc. REST call.

**Dependencies:** Phase 0 Keeper account and transport/auth decisions.

**Acceptance criteria**

- An MCP Inspector or equivalent test demonstrates connection, server/tool
  discovery, and a real read-only call to Keeper using a non-sensitive test calendar.
- Tests cover malformed arguments, authentication failure, timeout, rate limit, empty
  results, and server errors with no fabricated events.
- Logs show tool, run ID, duration, status, and safe error code without OAuth tokens,
  personal calendar content, or private model reasoning.
- Documentation reports the integration as tested only after the real call succeeds.

### Phase 2 — Resolve class schedule and create an end-of-class trigger (P0)

**Likely files:** schedule service under `lib/`, `lib/db/dataset_schema.sql` only if
a justified durable call/job structure is needed, focused tests, and a protected
server-side scheduler/worker entry point.

**Work**

- Normalise PostgreSQL school-calendar dates and local times using the configured
  school timezone. Handle date boundaries, daylight-saving changes where applicable,
  cancelled/changed class periods, missing end times, and overlapping classes.
- Resolve the scheduled period directly from `school_calendar`, validate its teacher
  and class against `timetable_assignments`, and use the school/class relationships.
  Do not infer assignments from email event titles.
- If Keeper availability checks are approved, treat them as an additional
  busy/conflict signal only. Define how a Keeper outage or conflicting appointment
  affects dispatch; do not silently replace PostgreSQL schedule data with Keeper data.
- Define a durable follow-up/call-attempt record or equivalent idempotent job state.
  The existing schedule and observation schema does not itself demonstrate a
  call-attempt lifecycle. Store only the necessary event reference, teacher, due
  time, provider IDs, status, timestamps, and safe error information.
- Implement the queue-preparation job to run once daily at 7:00 a.m. in the school's
  configured timezone, weekdays only. It queues that day's eligible follow-ups by
  scheduled teacher and period, with call execution delayed until after each period's
  end time. The job is schedule-driven and must run whether or not the assigned
  teacher is logged in.
- Exclude weekends and authoritative school holidays/closures before creating call
  jobs. The current schema has no dedicated holiday table; decide whether a safe
  existing representation is available or add a minimal school closure source as
  part of the implementation. Do not infer "not a holiday" merely from missing
  timetable rows.
- In explicit demo mode, direct all outbound test calls only to the locally configured
  approved demo number. Keep it in ignored `.env.local`, never expose it to the
  browser or logs, and do not use it as a teacher's persisted contact number.
- Persist call outcomes against the scheduled teacher so they can be retrieved for
  that teacher's chat/activity view on a later login. Login controls access to
  outcomes, not whether a scheduled call is queued or sent.
- Select a reliable scheduler/worker compatible with the actual deployment target.
  For local development, provide a protected/manual trigger for testing; the
  production goal remains an automatic dispatch at class end. A model must not be
  responsible for running continuously or deciding that a timer fired.
- Create due jobs from PostgreSQL schedule rows and revalidate eligibility
  immediately before dispatch. If Keeper availability checking is required, make a
  bounded lookup only for the relevant teacher/time window and respect Keeper limits.
  Use a deterministic idempotency key based on the PostgreSQL calendar-entry,
  teacher, and end time so retries cannot place duplicate calls.
- Define behavior for schedule edits, missing/cancelled events, late jobs, duplicate
  scheduler delivery, service downtime, concurrent jobs, and an already active
  subsequent class.

**Dependencies:** Phase 0 schedule-authority/timezone decisions. A live Keeper read
is required only if the product adopts Keeper availability checks; it is not required
for queueing from PostgreSQL.

**Acceptance criteria**

- Given a teacher's 8:00–9:00 class, the call job is not eligible before 9:00 in the
  school's timezone and becomes due at 9:00 (or at the agreed post-class delay).
- The 7:00 a.m. queue run prepares calls for the same day's eligible classes on
  weekdays, skips weekends and configured holidays/closures, and creates no work for
  teachers without eligible assigned periods. It queues work even if those teachers
  are logged out.
- A test-mode call cannot be sent to any destination other than the locally approved
  demo number; normal/production mode cannot inherit the demo override.
- Cancelled, ambiguous, stale, or unmatched PostgreSQL schedule rows do not create
  an outbound call. If Keeper availability checking is enabled, an unavailable or
  conflicting result follows the explicit defer/fail-closed policy.
- Duplicate scheduler deliveries and retries create at most one call attempt per
  eligible event; a job is recoverable after worker restart.
- Tests cover timezone/date boundaries, overlapping schedule, event update/cancel,
  already-handled events, and no-call windows.
- Schedule information remains timing context and never creates attendance or
  observation data.

### Phase 3 — Add safe teacher-call lifecycle and Africa's Talking Voice (P0)

**Likely files:** replace/update `lib/external-mcp/voice.ts` as a server-side
Africa's Talking adapter; add call service/state handling under `lib/`; protected
webhook route(s) under `app/api/`; server-side environment documentation; focused
tests.

**Work**

- Correct the misleading Twilio/MCP placeholder. Implement the verified
  Africa's Talking Voice API as an ordinary server-side provider adapter unless a
  separately verified AT MCP server is selected.
- Create a state machine for call attempts, such as queued, initiated, ringing,
  answered, verification required, consent required, recording, completed,
  provider-rejected, teacher-declined, missed/no-answer, failed, transcription
  pending, review required, and saved. Final states must be based on actual
  provider/application evidence.
- Authenticate webhook callbacks using the provider's documented mechanism; validate
  payloads, replay/duplicate callbacks, and provider IDs. Never expose provider
  credentials to the browser.
- Add teacher contact eligibility, verification, explicit recording consent,
  opt-out, quiet-hour and frequency-cap checks, and safe retry rules.
- Add a hard demo/test-mode destination override sourced only from ignored local
  configuration. Verify that the Africa's Talking request targets the approved demo
  number; reject unintended numbers before calling. Do not store that test number in
  the teacher profile or include it in provider logs.
- Persist call outcomes (for example, queued, provider-rejected, teacher-declined,
  missed/no answer, failed, completed, and awaiting review) with the scheduled
  teacher ID and expose them only to the appropriately authorised teacher when they
  next open Dira. Outcomes must not depend on the teacher being logged in at call
  time.
- Store provider status and safe failure details. Use explicit timeouts and bounded
  retries only for failures known to be retryable.
- Do not include learner names or sensitive observation detail in call metadata or
  logs unless strictly required by the verified provider contract.

**Dependencies:** Phase 0 verified account/capabilities and policy; Phase 2 durable
due jobs.

**Acceptance criteria**

- A controlled non-production test can place a call only to the locally configured
  approved demo number and reflect the actual provider result in Dira.
- Webhook signature/verification, invalid payloads, duplicate delivery, replay,
  timeout, provider rejection, no-answer, busy, and retry cases are tested.
- Calls cannot be sent before the scheduled end, outside allowed call rules, without
  an eligible verified teacher, or after opt-out.
- Provider failures never display or persist a success state.
- The assigned teacher can later see the actual rejected, missed/no-answer, failed,
  or completed call result in their own chat/activity history; another teacher cannot
  see it by changing a client-supplied ID.

### Phase 4 — Capture, transcribe, review, and persist the observation (P1)

**Likely files:** `lib/external-mcp/stt.ts`, `lib/services/transcription.ts`,
`lib/mcp-tools/logObservation.ts`, `lib/db/schema.ts`,
`app/api/mcp/log-observation/route.ts`, teacher UI under `app/(teacher)/`, and
focused tests.

**Work**

- Verify how Africa's Talking provides call recording/audio retrieval or IVR-captured
  audio, then securely connect the actual recording reference/audio to the
  transcription service. Do not infer that an audio file exists just because a call
  completed.
- Replace the Whissle placeholder with its documented server-side API contract.
  Do not call it MCP unless a real Whissle MCP server is independently verified.
- Keep call recording/reference and transcript separate. Restrict access and
  retention; avoid placing audio blobs in ordinary application logs or browser
  storage.
- Persist a usable phone transcript as an observation with a distinct teacher-review
  status of `recorded`; saving the transcript does not mean the teacher has confirmed
  it or that it is verified evidence. Add a dedicated review-status field or
  equivalent state history rather than reusing the existing
  `verification_status` field, which represents a different evidence concept.
- Define the review transitions: `recorded` means saved and awaiting review;
  `confirmed` means the teacher accepted it without changes; `updated` means the
  teacher edited and saved it. Preserve the original transcript/wording and record
  who changed it and when; use idempotent updates.
- Require a verified teacher and explicit learner selection/confirmation before
  associating content with a learner. If the teacher cannot identify a learner
  confidently, leave the call unlinked and request follow-up; do not guess based on
  schedule alone.
- Save attributable observations as `recorded` before later teacher confirmation.
  Surface transcript uncertainty in review and request clarification for learner
  identity, negation, counts, or materially important facts; do not silently resolve
  uncertainty or claim the item is confirmed.
- Reuse `log_observation` for the initial persisted record and subsequent authorised
  review/update path. Include phone capture provenance and idempotency based on the
  call/recording submission so webhook or network retries cannot duplicate it.
- In chat, show a compact observation entry with small confirm and edit icon buttons
  while status is `recorded`. On `/learners/[id]`, provide fuller controls including
  an observation-type selector and an optional dropdown to link a suggested test.
- Preserve the source transcript and an auditable edit trail. Any optional model
  cleanup must not silently replace the teacher's wording or add inferred facts.

**Dependencies:** Phase 0 consent and retention decisions; Phase 3 verified call
recording path.

**Acceptance criteria**

- A controlled test call produces audio only after required consent; the correct
  Whissle request is made with a supported format and returns an actual transcript or
  explicit error.
- Provider/transcription timeout, unsupported audio, or empty response creates no
  observation and shows an actionable status. A transcript with unresolved learner
  identity remains unlinked; materially uncertain content is not shown as confirmed.
- A usable transcript is persisted once with status `recorded`; teacher confirmation
  changes it to `confirmed`, while an edit/save changes it to `updated`. The original
  transcript and the teacher's later changes are traceable under the retention policy.
- Learner identity is explicitly confirmed by the verified teacher; caller ID,
  schedule, model output, or transcript matching alone cannot select a learner.
- The compact chat actions and detailed `/learners/[id]` controls enforce teacher
  authorisation server-side; the detailed view supports observation type and optional
  linked suggested-test selection.
- Replaying a callback or retrying a save does not create duplicate call attempts or
  observations.

### Phase 5 — Teacher-facing status, operations, and end-to-end verification (P1)

**Likely files:** teacher UI under `app/(teacher)/`, application routes/services,
`EVALS.md`, relevant integration/reference documentation, `.env.example` after
actual configuration names are implemented.

**Work**

- Show an understandable call workflow status and the next action needed from the
  teacher (for example, verify identity, consent, review transcript, retry, or
  contact support).
- When the assigned teacher next logs in, show that teacher's persisted call outcomes
  (such as provider-rejected, teacher-declined, missed/no answer, failed, completed,
  and awaiting review) in their chat/activity history. Calls are queued and placed
  from the schedule even if the teacher is logged out; login is for access to the
  result, not a dispatch condition. Enforce teacher ownership server-side.
- Add the requested spoken prompt for the weekly focus group and ensure call results
  are clearly separated from learner observations.
- Keep the chat observation treatment compact: a `recorded` observation gets small
  confirm and edit icon actions. Put detailed review controls on `/learners/[id]`,
  including observation type and optional link to a suggested test.
- Expose review status (`recorded`, `confirmed`, `updated`) separately from call
  delivery status and from evidence `verification_status`.
- Add an auditable operational view for authorised staff with call/event reference,
  teacher, timestamps, provider status, transcription status, and safe error codes.
  Avoid unnecessary learner text, audio, tokens, or secrets in logs.
- Document provider configuration by category and actual code-used variable names.
  Keep credentials server-side; never use `NEXT_PUBLIC_*` for secrets.
- Add integration tests with synthetic teacher/calendar data and a provider sandbox
  or test account. Keep a separate, explicit gate for any controlled real call.
- Update integration documentation to separate selected, configured, smoke-tested,
  and end-to-end-tested states.

**Dependencies:** Phases 1–4.

**Acceptance criteria**

- A teacher can understand whether a call is due, placed, missed, declined, awaiting
  transcription/review, or saved without seeing a false success.
- After login, each teacher sees their own provider-rejected, teacher-declined,
  missed, failed, completed call outcomes and recorded observations; another teacher
  cannot retrieve them by changing a client-supplied identifier.
- The compact chat review actions and detailed learner-page controls behave as
  specified; confirm, edit, observation type, and suggested-test association save the
  correct teacher-review status and preserve the original transcript.
- End-to-end test proves: PostgreSQL school-calendar lookup -> class-end eligibility
  (and, if enabled, required Keeper MCP availability check) -> one call attempt ->
  authenticated callback -> consent/teacher verification -> Whissle transcript ->
  teacher review -> exactly one saved observation.
- A full failure-path test proves that PostgreSQL schedule unavailability, schedule
  ambiguity, Keeper outage when availability checking is enabled, provider outage,
  webhook rejection, transcription failure, consent refusal, and persistence failure
  do not create fake success or fabricated observations.
- Logs are redacted and integration status accurately states which steps have
  actually executed.

## Suggested sequence and priority

| Order | Priority | Phase | Why this comes next |
|---:|---|---|---|
| 1 | P0 | Phase 0: decisions and provider feasibility | Prevents building around unsupported provider features or unsafe call/recording assumptions. |
| 2 | P0 | Phase 1: Keeper MCP | Establishes the selected borrowed MCP integration; availability checks are included only if confirmed as a product need. |
| 3 | P0 | Phase 2: PostgreSQL schedule queue and end-time trigger | Uses the existing authoritative school schedule to make “after class” deterministic, timely, and duplicate-safe without calendar mirroring. |
| 4 | P0 | Phase 3: safe outbound call | Places a real controlled call and handles provider lifecycle truthfully. |
| 5 | P1 | Phase 4: transcription and observation save | Connects phone audio to the already working teacher-reviewed persistence path. |
| 6 | P1 | Phase 5: UI, operations, and full verification | Makes the complete workflow testable, supportable, and demonstrable. |
| 7 | P1 | Phase 6.2: Dira MCP server, agent, and scheduler trigger | Connects reusable Dira tools to the scheduled agent while keeping the timer and LLM out of authoritative scheduling and safety decisions. |

## Decisions/blockers to close before implementation

1. Confirm that the call is intended to capture a short learner observation rather than
   only remind the teacher.
2. Confirm PostgreSQL `school_calendar` as the canonical dated class schedule and
   decide whether a read-only Keeper check for work-calendar conflicts is needed.
3. Confirm the school timezone, 7:00 a.m. weekday queue run, authoritative holiday
   source, whether to call exactly at the scheduled end or after a short agreed
   buffer, allowable hours, and overlapping-class behavior.
4. Use a deterministic server-side demo teacher resolver for the first single-teacher
   flow; defer production login, contact verification, and multi-teacher access
   control. Confirm recording consent, opt-out, call limits, retry policy, and
   recording/transcript retention before any controlled recording.
5. Verify the actual Keeper, Africa's Talking Voice, and Whissle accounts and their
   current product/API capabilities. If any capability is unavailable, mark that
   phase **BLOCKED** and agree a safe alternative before coding.
6. Select a hosting-compatible timer/trigger after confirming the actual deployment.
   It must wake the Dira agent, which uses Dira's MCP client and server tools; it
   must not call queue/dispatch business logic directly. A local-only timer is not
   sufficient for production.
7. Confirm the focus-group-of-the-week roster source and the review-status
   persistence/audit fields. The current observation schema's `verification_status`
   must not be overloaded to represent teacher review.
8. Confirm that the demo number is configured only in ignored local environment
   state and that the provider can be hard-limited to that destination in test mode.

## Relevant repository references

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — selected Keeper.sh calendar MCP, Africa's
  Talking Voice API, Whissle, end-to-end architecture, and system boundaries.
- [`docs/reference/INTEGRATIONS.md`](./docs/reference/INTEGRATIONS.md) — provider
  classifications, setup and capability verification, configuration, and honest
  integration statuses.
- [`docs/reference/MCP_TOOLS.md`](./docs/reference/MCP_TOOLS.md) — MCP client/server
  boundary, Keeper requirement, observation tool input, identity, and idempotency.
- [`docs/reference/USER_FLOWS.md`](./docs/reference/USER_FLOWS.md) — phone capture,
  transcript review, persistence, and calendar-aware follow-up flow.
- [`docs/reference/SAFETY_AND_GUARDRAILS.md`](./docs/reference/SAFETY_AND_GUARDRAILS.md)
  — identity, transcription, privacy, calendar, and provider failure safeguards.
- [`docs/reference/PRODUCT_REQUIREMENTS.md`](./docs/reference/PRODUCT_REQUIREMENTS.md)
  — PR-13 Keeper calendar MCP, PR-14 Whissle, PR-16 outbound phone capture, and
  reliability requirements.
- [`lib/db/dataset_schema.sql`](./lib/db/dataset_schema.sql) — current timetable,
  school calendar, attendance, and observation schema.
- [`lib/agent/mcp-client.ts`](./lib/agent/mcp-client.ts),
  [`lib/external-mcp/calendar.ts`](./lib/external-mcp/calendar.ts),
  [`lib/external-mcp/voice.ts`](./lib/external-mcp/voice.ts),
  [`lib/external-mcp/stt.ts`](./lib/external-mcp/stt.ts), and
  [`lib/services/transcription.ts`](./lib/services/transcription.ts) — current
  integration placeholders to replace or complete during the relevant phases.

## Scope exclusions

- No automatic attendance marking or inference that a class/lesson occurred.
- No observation generated from calendar metadata, call duration, or model inference.
- No direct calendar-provider API substituted for the required Keeper MCP connection.
- No copying or continuous bidirectional synchronization of PostgreSQL school
  timetable entries to teachers' work calendars in the MVP. If teacher-calendar
  visibility becomes a requirement, plan a separate one-way sync with PostgreSQL
  remaining authoritative.
- No assumption that Africa's Talking or Whissle is an MCP server.
- No calls to real teachers as part of the demo. A single controlled call may use
  only the explicitly configured demo destination after account capability,
  recording notice/consent, and a test procedure are explicitly approved. Production
  multi-teacher calling remains blocked on authentication, verified contacts, and
  access controls.
- No implementation work is authorized by this plan alone.
