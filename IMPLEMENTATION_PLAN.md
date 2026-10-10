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
- Do not attach a call or transcript to a learner until the teacher is verified and
  explicitly identifies/confirms the learner.
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
| Outbound voice | **Partially implemented** | `lib/external-mcp/voice.ts` submits a server-side Africa's Talking call request with bounded timeout and sanitized outcomes. Credentials/account capability and any live call remain unverified. |
| Speech transcription | **Not implemented** | `lib/external-mcp/stt.ts` describes Whissle as MCP and its methods return empty strings. `lib/services/transcription.ts` supplies an interface/adapter pattern, not a provider integration. |
| Observation persistence | **Implemented in the text workflow; phone path not implemented** | Reuse the existing `log_observation` capability and the working text-observation flow. Phone-originated audio/transcripts still need validation, review, provenance, and idempotency wiring. |
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
2. A daily scheduler runs at 7:00 a.m. in the school's timezone on weekdays, checks
   the school's holiday/closure data, and queues eligible calls for that day's dated
   class periods. The actual call job is due at each assigned class's end (for an
   8:00–9:00 lesson, at 9:00). Weekend and holiday dates produce no call jobs. A
   calendar event need not be copied into the teacher's work email for this
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
6. The call explains its purpose and recording/transcription practices, verifies the
    teacher using the approved authentication method, and obtains any required
    recording consent before recording. It opens with: “Hello teacher, please share
    remarks you have for one or more of your focus group of the week. Make sure to
    state the name of the child you are talking about before each of their
    observations. You may begin.” If verification or consent fails, do not record or
    save learner observations.
7. If provider capabilities permit audio retrieval/recording, Dira securely obtains
    the audio and submits it to Whissle using Whissle's documented audio contract.
    Dira presents the transcript to the teacher for review; uncertainty about learner
    identity, negation, numbers, or material facts requires correction/confirmation.
8. Dira resolves and validates each named learner against the verified teacher's
    authorised focus group. It saves a usable, attributable transcript through the
    existing observation persistence path with trusted teacher context, phone capture
    provenance, transcript/recording references where permitted, and an idempotency
    key. The observation is marked `recorded` (saved but awaiting teacher review).
    Identity ambiguity or material transcription uncertainty is not silently guessed
    or presented as confirmed; keep it unlinked/in review until clarified.
9. On a later login, the teacher sees the call outcome (for example, rejected, missed,
    completed, or awaiting transcript review) in their own chat/activity history.
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

## Decisions/blockers to close before implementation

1. Confirm that the call is intended to capture a short learner observation rather than
   only remind the teacher.
2. Confirm PostgreSQL `school_calendar` as the canonical dated class schedule and
   decide whether a read-only Keeper check for work-calendar conflicts is needed.
3. Confirm the school timezone, 7:00 a.m. weekday queue run, authoritative holiday
   source, whether to call exactly at the scheduled end or after a short agreed
   buffer, allowable hours, and overlapping-class behavior.
4. Confirm teacher verification, recording consent, opt-out, call limits, retry
   policy, and recording/transcript retention.
5. Verify the actual Keeper, Africa's Talking Voice, and Whissle accounts and their
   current product/API capabilities. If any capability is unavailable, mark that
   phase **BLOCKED** and agree a safe alternative before coding.
6. Select the production scheduler/worker only after confirming the actual hosting
   target and its execution guarantees. A local-only timer is not sufficient for
   production.
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
- No calls to real teachers until account capability, authentication, consent, and a
  controlled test procedure are explicitly approved.
- No implementation work is authorized by this plan alone.
