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
| `suggest_test` | Dira-owned | Review a learner's evidence, retrieve educational guidance quickly, and suggest a small classroom activity with citations | Usually yes if the suggestion/test record is persisted; exact persistence choice must be consistent in implementation |
| `build_evidence_summary` | Dira-owned capability; legacy implementation filename may be `draftPathwayNote.ts` | Build Evidence Card content from real observations, tests, outcomes, gaps and contradictions | Read/compute; persist only if the implementation has an explicit, audited reason |
| `prepare_daily_follow_up_queue` | Dira-owned MCP tool | Queue eligible schedule rows for the deterministic demo teacher and school; creates jobs only | Yes; idempotent database queue preparation |
| `list_due_follow_ups` | Dira-owned MCP tool | List due queued jobs for the deterministic demo teacher | No; read-only candidate listing |
| `dispatch_one_due_follow_up` | Dira-owned MCP tool | Request dispatch of at most one due job after server-side checks | Yes; guarded, atomic call attempt |
| Keeper tools such as `list_calendars` / `get_events` where exposed | Borrowed external server | Retrieve authorised calendar context via MCP | Provider/tool-dependent; request only minimal read access for MVP |

The deployed Dira MCP endpoint currently exposes `log_observation`,
`prepare_daily_follow_up_queue`, `list_due_follow_ups`, and
`dispatch_one_due_follow_up`. The existing `suggest_test` and evidence-summary
application routes are not thereby MCP tools. Keep the registry, schemas, tests
and docs aligned with actual MCP discovery.

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

### Proposed input schema

```json
{
  "learner_id": "string, required",
  "requesting_teacher_id": "string from trusted context, not model authority",
  "context": "string, optional; relevant subject/activity context",
  "time_window": "string or start/end dates, optional",
  "exclude_test_ids": ["string", "optional IDs of prior suggestions not to repeat"]
}
```

### Required processing

1. Validate teacher permission and retrieve relevant observations/tests/outcomes for the selected learner.
2. Detect candidate repeated or weakly supported questions while preserving contradictory observations.
3. Assess whether there is sufficient evidence to propose a useful test; a single thin observation should not become a learner trait.
4. Attempt external retrieval of approved educational guidance **before finalising the suggestion**. Use a strict configurable timeout of a few seconds as a starting point, tuned by tests. Retrieval is a separate integration from the GLM model API.
5. If relevant guidance was returned, pass the relevant excerpt/structured result and source metadata to the model. If retrieval times out, fails, or returns nothing relevant, continue using the available learner evidence and model knowledge, marking retrieval unavailable/no result.
6. Generate a small, low-preparation activity including purpose, steps, approximate duration/effort, what to observe, and what to log afterwards.
7. Validate each cited observation ID against PostgreSQL and verify that it belongs to the requested learner and supports the reason.
8. Validate the output for fixed labels, diagnoses, rankings, pathway assignments, unsupported claims and fabricated citations.
9. Persist a test/suggestion record if that is the chosen implementation behaviour, then return its real ID and state.

### Proposed output schema

```json
{
  "ok": true,
  "test_id": "real test ID if persisted",
  "learner_id": "verified learner ID",
  "exploration_question": "A cautious question worth exploring",
  "reason": "Why this question is worth checking",
  "suggested_activity": "Specific classroom activity and steps",
  "purpose": "What the activity is intended to explore",
  "estimated_minutes": 10,
  "what_to_observe": ["observable behaviours/events"],
  "what_to_log_after": "What the teacher should record",
  "evidence_ids": ["OBS-IDs actually retrieved and validated"],
  "educational_guidance": [
    {"title": "Actual retrieved title", "url": "actual URL", "relevant_excerpt": "short relevant excerpt"}
  ],
  "retrieval_status": "success | no_relevant_results | timeout | provider_error | not_configured",
  "limitations": ["What the evidence does not establish"],
  "status": "SUGGESTED"
}
```

`estimated_minutes` is an example schema field and may be changed to `estimated_effort` if the final UI supports qualitative values. Do not return fake evidence IDs, sources, or `test_id` values.

### Invariants

- Educational guidance informs the design of an activity; it does not serve as evidence about this individual learner.
- Do not send unnecessary learner-identifying information to educational source services.
- Timeout/failure does not block the teacher workflow indefinitely.
- Retrieval failure must not be hidden or represented as successful source consultation.
- The tool suggests an exploration, not a career or learner pathway.

## 6. Tool 3 — `build_evidence_summary`

### Purpose

Provide the data and plain-language summary for the Learner Evidence Card. The current MVP does not generate a pathway note for guardian delivery.

### Proposed input schema

```json
{
  "learner_id": "string, required",
  "time_range": {
    "start": "ISO-8601 datetime, optional",
    "end": "ISO-8601 datetime, optional"
  },
  "include_open_questions": true
}
```

### Required processing

1. Authorise the request and query underlying observations, tests, and linked outcomes for the selected learner/time range.
2. Validate ownership and relationships, including every observation's `linked_test_id`.
3. Assemble questions explored, tests conducted, observed outcomes, supporting record IDs, contradictions, evidence gaps, and the time period covered.
4. Build the card from source records rather than treating a previous AI summary as authoritative.
5. Generate concise, cautious descriptions of what was observed and what remains unclear.
6. Validate every claim and evidence reference; reject or rewrite unsupported language and any fixed learner label/pathway.

### Proposed output schema

```json
{
  "ok": true,
  "learner_id": "verified learner ID",
  "time_range": {"start": "ISO-8601 or null", "end": "ISO-8601 or null"},
  "questions_explored": [
    {"question": "Question", "status": "open | explored | inconclusive", "evidence_ids": ["OBS-ID"]}
  ],
  "tests": [
    {"test_id": "TEST-ID", "status": "SUGGESTED | ACCEPTED | NOT_YET | REGENERATED | COMPLETED", "outcome_observation_ids": ["OBS-ID"]}
  ],
  "observed_outcomes": [
    {"summary": "Behaviour/context grounded in record", "evidence_ids": ["OBS-ID"]}
  ],
  "contradictions": ["Grounded description of conflicting records"],
  "evidence_gaps": ["What has not been recorded or remains unclear"],
  "next_questions": ["Possible question for teacher consideration"],
  "disclaimer": "This card summarises recorded evidence and does not determine a learner's ability or future."
}
```

### Invariants

- No diagnosis, learner ranking, fixed trait, career advice or pathway assignment.
- No claim that a test is completed without a teacher-recorded outcome.
- Missing data is not negative evidence.
- Contradictory evidence and timeframe limits remain visible.
- No guardian approval or delivery capability is required by this tool.

## 7. Common error contract

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

## 8. MCP verification checklist

- Start the Dira MCP server and inspect the transport it actually exposes.
- Use MCP Inspector or an equivalent client to discover the three current Dira tools and their schemas.
- Invoke `log_observation` and verify the exact PostgreSQL record and provenance.
- Invoke `suggest_test` and verify real observation IDs, retrieval status and source citations.
- Invoke `build_evidence_summary` and verify each card item traces to underlying rows.
- Connect Dira's MCP client to Keeper.sh and perform one real, bounded calendar tool call using the supported transport/authentication flow.
- Verify timeouts, invalid input, unavailable integrations and unauthorised records return structured errors.
- Confirm that the agent has no pathway-note approval action because that workflow is outside the current MVP.
