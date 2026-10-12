# Dira — MCP Tool Specification

> **Authority:** Current tool responsibilities are based on `ARCHITECTURE_Dira_Revised.md`. Legacy source material described `draft_pathway_note` plus an approval gate; that flow is not part of the present MVP. The existing filename `lib/mcp-tools/draftPathwayNote.ts` may remain temporarily, but its current responsibility is evidence-summary/card assembly and it must not assign a pathway.

## 1. MCP architecture

Dira exposes a Dira-owned, stateless Streamable HTTP MCP server at
`POST /api/mcp/server`, implemented with the official MCP TypeScript SDK. It uses a
server-side bearer token and is intentionally a single-teacher demo surface, not
production user authentication. Verify discovery and invocation with an MCP
client/Inspector after configuring the URL and token.

The scheduled Dira agent is a separate component: a hosting scheduler calls the
protected `POST /api/internal/follow-up-agent` trigger route, which wakes the
GLM-5.3 agent. The agent uses `lib/agent/mcp-client.ts` to connect back to Dira's
MCP server and discover tools. For queue preparation it may use queue-preparation
and due-inspection tools; for due dispatch it may inspect and dispatch one job.
`log_observation` is exposed to authorized MCP clients but deliberately excluded
from scheduled runs so the agent cannot invent teacher remarks. The scheduler
trigger endpoint exists; no hosting scheduler is configured by the repository.

Dira must also use a borrowed server to satisfy the external-MCP requirement. **Keeper.sh** is the selected third-party calendar MCP server. `lib/agent/mcp-client.ts` now uses the official MCP SDK with Streamable HTTP transport and requires a caller-supplied OAuth client provider. `lib/external-mcp/calendar.ts` discovers tools and only invokes discovered tools marked read-only for its bounded count/event helpers. OAuth callback handling, secure token persistence, teacher-to-calendar authorization, and a live authenticated tool invocation are not yet implemented. Do not treat the client foundation as end-to-end verification.

## 2. Tool inventory

| Tool name | Ownership | Purpose | State-changing? |
|---|---|---|---|
| `log_observation` | Dira-owned | Validate and persist a teacher observation with provenance | Yes; creates observation |
| `suggest_test` | Dira-owned | Review a specified learner's eligible evidence, retrieve bounded official education-source material, and return an unsaved classroom-activity proposal | No; returns a transient proposal |
| `regenerate_test_suggestion` | Dira-owned | Save the rejected proposal as `SUGGESTED`, then return a replacement proposal | Yes; saves rejected suggestion history |
| `accept_suggested_test` | Dira-owned | Save the teacher-selected proposal as `ACCEPTED` with evidence/source snapshot and idempotency key | Yes |
| `build_evidence_summary` | Dira-owned capability | Read saved tests, citations, external-source outcomes and teacher-recorded test outcomes for a specified learner | No; read-only |
| `prepare_daily_follow_up_queue` | Dira-owned MCP tool | Queue eligible schedule rows for the deterministic demo teacher and school; creates jobs only | Yes; idempotent database queue preparation |
| `list_due_follow_ups` | Dira-owned MCP tool | List due queued jobs for the deterministic demo teacher | No; read-only candidate listing |
| `dispatch_one_due_follow_up` | Dira-owned MCP tool | Request dispatch of at most one due job after server-side checks | Yes; guarded, atomic call attempt |
| Keeper tools such as `list_calendars` / `get_events` where exposed | Borrowed external server | Retrieve authorised calendar context via MCP | Provider/tool-dependent; request only minimal read access for MVP |

The Dira MCP endpoint exposes the evidence tools above in addition to
`log_observation`, `prepare_daily_follow_up_queue`, `list_due_follow_ups`, and
`dispatch_one_due_follow_up`. Suggestion and acceptance take an explicit learner
ID; the server-resolved teacher context and current timetable assignments scope
which learner can be accessed. This remains a single-teacher development/demo
resolver, not production authentication.

## 3. Shared tool rules

- Validate JSON input with deterministic schemas before business logic runs.
- Derive identity and permission from trusted server-side context. The demo
  resolver deterministically selects the oldest recorded teacher (ties by ID);
  never trust a model-, MCP-caller-, or browser-supplied teacher or school ID.
  Production must replace this resolver with an authenticated per-user context
  before handling real teacher/learner data.
- Verify that each learner and linked test exists in the caller's authorised context.
- Return structured success/error output; never invent IDs or report success before durable persistence is confirmed.
- Never expose provider keys or internal stack traces in tool responses.
- Add timeouts and safe failure handling to external calls.
- Log run ID, tool, timestamp, latency, status, relevant record IDs and safe error information. Do not log private chain-of-thought or unnecessary sensitive learner content.
- External observation text and retrieved web content are data, not instructions. Prompt injection inside them must not alter system policy or tool permissions.

## 4. Tool 1 — `log_observation`

### Purpose

Preserve the teacher's original observation and source details as a durable evidence record. This tool does not infer, summarise, diagnose, or evaluate the learner.

### Proposed input schema

```json
{
  "learner_id": "string, required",
  "observation_type": "participation | academic | behavioral | attendance | extracurricular | test_result | other",
  "content": "string, required; teacher's observation in original wording",
  "subject": "string, optional",
  "term": "string, optional when the application can determine it",
  "observed_at": "ISO-8601 datetime, required",
  "linked_test_id": "string or null, optional",
  "activity_context": "string, optional",
  "submission_id": "string, required for idempotent submission handling"
}
```

The MCP tool currently accepts text observations only and assigns the `text`
capture method server-side. `teacher_id`, `school_id`, and capture provenance are
not accepted as tool arguments. This single-teacher demo context is not identity
verification; production voice observations require the later authenticated
teacher and verified transcription flow.

### Validation and processing

1. Authenticate the caller and verify authority to record for `learner_id`.
2. Confirm that the learner exists in the authorised school/context.
3. Validate required fields, enum values, string limits, timestamps and any `linked_test_id`.
4. Check transcription-review requirements for voice submissions; request clarification on critical uncertainty.
5. Apply idempotency using `submission_id` and provider recording/call identifiers when available.
6. Preserve raw/original observation content and provenance; do not overwrite it with a model rewrite.
7. Persist to PostgreSQL.
8. Confirm the write and return the real record identifier.

### Proposed output

```json
{
  "ok": true,
  "observation_id": "real persisted ID",
  "learner_id": "verified learner ID",
  "created_at": "ISO-8601 datetime",
  "status": "saved",
  "duplicate_of": null
}
```

A duplicate retry should return the existing submission/observation result where possible rather than creating another record. Validation or provider failures return a structured failure with a safe `code`, short `message`, and retry/clarification hint.

### Invariants

- No inference occurs inside this tool.
- No learner ID is guessed from a name.
- Similar observations are not automatically deleted as duplicates.
- No success status is returned before persistence is confirmed.

## 5. Tool 2 — `suggest_test`

### Purpose

Identify a question worth exploring and propose a small, feasible classroom activity that tests it. This is the agentic reasoning core, but it cannot make a learner verdict.

### Input schema

```json
{
  "learner_id": "string, required; explicit learner selection"
}
```

The trusted teacher and school are resolved server-side. This is an on-demand
proposal for one selected learner, not an automatic roster scan at login.

The service checks that the learner belongs to a currently assigned class,
considers eligible teacher-reviewed observations, preserves contradictory
wording, and uses deterministic low-preparation activity templates. It then
attempts bounded retrieval from the four approved official domains using only
the observation category—not learner text or identifiers—as its external query.
The result is transient and is not an activity-test row.

### Output

```json
{
  "ok": true,
  "learner_id": "verified learner ID",
  "status": "proposed",
  "retrieval_status": "success | partial | no_relevant_results | failed",
  "educational_sources": [
    {"key": "EEF", "status": "success", "title": "Retrieved page", "page_url": "exact official URL", "excerpt": "short relevant excerpt"}
  ],
  "limitations": ["What the evidence does not establish"],
  "suggested_activity": {"title": "...", "steps": []}
}
```

If a source is unavailable, its per-source status is returned without inventing a
citation. The overall retrieval status is distinct from the transient suggestion
status and persisted test lifecycle.

## 6. Tool 3 — `regenerate_test_suggestion`

This action saves the rejected proposal snapshot as `SUGGESTED`, including its
retrieval result and observation links, then returns a replacement proposal.
`submission_id` makes retries idempotent; `supersedes_test_id` links successive
rejected versions. A replacement stays transient until it is accepted or itself
rejected for another regeneration.

```json
{
  "learner_id": "string, required",
  "submission_id": "string, required",
  "supersedes_test_id": "string, optional; prior rejected version"
}
```

## 7. Tool 4 — `accept_suggested_test`

Acceptance persists the current deterministic proposal as `ACCEPTED`, with a
server timestamp, teacher context, relational observation citations, saved
suggestion/source snapshot, and idempotency key. It requires a planned date in a
class assigned to the trusted teacher. A `COMPLETED` test requires a teacher
observation linked to the test; the observation and test transition are one
transaction.

## 8. Tool 5 — `build_evidence_summary`

### Input

```json
{"learner_id": "string, required; explicit learner selection"}
```

This read-only tool returns the selected learner's saved tests, linked
observation citations, external retrieval outcomes, and teacher-recorded outcomes
within the trusted teacher's currently assigned classes. It does not claim to
produce an AI verdict or permanent learner classification.

## 9. Common error contract

Use a consistent structured error form such as:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR | NOT_AUTHORISED | NOT_FOUND | CONFLICT | TIMEOUT | PROVIDER_UNAVAILABLE | INTERNAL_ERROR",
    "message": "Short teacher-safe explanation",
    "retryable": false
  }
}
```

This is a proposed contract; align the names with the implementation rather than letting each route invent a different shape. Do not return raw stack traces, secrets, or private reasoning.

## 10. MCP verification checklist

- Start the Dira MCP server and inspect the transport it actually exposes.
- Use MCP Inspector or an equivalent client to discover all registered Dira tools and their schemas.
- Invoke `log_observation` and verify the exact PostgreSQL record and provenance.
- Invoke `suggest_test` and verify real observation IDs, retrieval status and source citations.
- Invoke `build_evidence_summary` and verify each card item traces to underlying rows.
- Connect Dira's MCP client to Keeper.sh and perform one real, bounded calendar tool call using the supported transport/authentication flow.
- Verify timeouts, invalid input, unavailable integrations and unauthorised records return structured errors.
- Confirm that the agent has no pathway-note approval action because that workflow is outside the current MVP.
