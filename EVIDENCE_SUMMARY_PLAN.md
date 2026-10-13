# Evidence Summary and Learner Evidence Card — Implementation Plan

**Status:** Historical planning document; implementation completed.

> **Historical plan:** This document predates the current Evidence Card and
> assessment implementation. Its earlier findings about missing schema, retrieval,
> and MCP capabilities are not current. The current versioned assessment design
> and implementation map are documented in `ARCHITECTURE.md` and
> `docs/reference/DATA_MODEL.md`.

## Objective

Build an evidence summary for a learner from teacher-authored observations and
teacher-selected classroom tests. The summary should help a teacher examine a
question or hypothesis, see evidence that supports or contradicts it, and decide
what to explore next. It must not diagnose, label, rank, or make a fixed
ability/pathway judgement about a learner.

The work also aligns the activity-test lifecycle with the product's intended
meaning, adds the missing suggestion fields identified in the Phase One discovery
report and `docs/reference/DATA_MODEL.md`, and documents the legacy pathway-note
tables as deprecated without dropping them.

## Decisions supplied for this plan

### Activity-test statuses

Use these exact persisted statuses and meanings:

| Status | Meaning |
|---|---|
| `SUGGESTED` | The teacher rejected this suggestion and asked Dira to generate another. Preserve this suggestion as history and link its replacement. |
| `ACCEPTED` | The teacher selected the test; its outcome has not yet been recorded. |
| `COMPLETED` | The teacher recorded the outcome as an observation linked to this test. |

The state transitions must preserve those meanings:

- A generated suggestion is presented to the teacher as a proposed action.
- If the teacher accepts it, persist it as `ACCEPTED`.
- If the teacher asks for regeneration, preserve the rejected proposal as
  `SUGGESTED`, generate a replacement, and link the replacement to the prior
  suggestion through the supersession relationship.
- When the teacher records an outcome, persist the observation and transition the
  accepted test to `COMPLETED` in one transaction.
- Do not mark a test completed merely because time passed, a call ended, a model
  generated a summary, or an outcome was inferred.

This deliberately means that a newly generated proposal awaiting the teacher's
choice is a transient UI/API proposal, not a persisted `SUGGESTED` test: the
user-defined meaning of `SUGGESTED` is specifically the rejected proposal that
prompted regeneration. Confirm this lifecycle before implementation because it
differs from the older generic state diagram in `DATA_MODEL.md`.

`NOT_YET` and `REGENERATED` are not part of the requested persisted status set.
Do not add them unless the product owner separately approves them. A teacher
deferral can remain an explicit interaction outcome outside this three-state
test lifecycle for the initial implementation.

### Approved educational sources

The evidence-summary/assessment function will contain a hard-coded source list
for these four organisations, as requested:

| Key | Source | Starting URL | Intended use |
|---|---|---|---|
| IB | International Baccalaureate | <https://www.ibo.org/> | Curriculum principles, inquiry, learner agency |
| EEF | Education Endowment Foundation | <https://educationendowmentfoundation.org.uk/> | Evidence-informed teaching approaches |
| AMI | Association Montessori Internationale | <https://montessori-ami.org/> | Montessori principles and observation |
| WWC | What Works Clearinghouse | <https://ies.ed.gov/ncee/wwc/> | Research reviews and practice guides |

These are approved starting points, not claims that the sites have already been
queried or that their home pages alone provide useful evidence. The implementation
must retrieve relevant official material before citing it and must identify
exactly which pages were actually accessed.

## Findings from Phase One discovery and merged suggestion work

- `observations.original_observation` remains the teacher's original wording and
  must remain the underlying factual record; generated interpretation is separate.
- The checked-in `lib/db/dataset_schema.sql` still defines `activity_tests.status`
  as `Completed`, `In progress`, or `Pending`. The merged suggestion commit did
  **not** change this schema and added no activity-test migration.
- The merged `lib/mcp-tools/suggestTest.ts` adds useful deterministic suggestion
  logic: it groups reviewed observations, flags exact duplicates and
  under-corroborated signals, selects a bounded activity by observation type,
  returns cited observation IDs, and refuses to suggest another activity while an
  open test cites the same evidence. Preserve and extend this behavior rather than
  replacing it wholesale.
- The merged service also adds `suggestTest` and `acceptSuggestion` persistence
  paths, but they expect `activity_tests.approval_submission_id` and
  `activity_tests.suggestion_payload`, neither of which exists in the checked-in
  fresh-database schema. Acceptance writes status `Accepted`, which also conflicts
  with both the schema's title-case status constraint and the requested uppercase
  status vocabulary. Treat these as current code/schema integration gaps to
  reconcile in the migration and callers—not as schema updates already delivered
  by the merge.
- The merged suggestion's `SuggestTestResult.status` is an **in-memory result
  state**, with values such as `proposed`, `insufficient_evidence`,
  `needs_review`, and `no_suitable_activity`. `EvidenceSignal.status` describes
  corroboration (`under_corroborated`/`more_corroborated`). Neither is an
  educational-source retrieval status, and neither should be copied into the
  persisted `activity_tests.status` column.
- No external educational-source retrieval or `retrieval_status` implementation
  was found in the merged service. Its current suggestions are derived from local
  evidence and hard-coded activity mappings; they do not query IB, EEF, AMI, or
  WWC. Keep the planned retrieval work, and define retrieval status separately
  from suggestion eligibility/result and persisted test lifecycle.
- Existing `activity_test_observations` already stores the exact linked
  observations for a test. The merged acceptance implementation populates it from
  the cited evidence IDs. Inspect whether this relation should gain a
  `citation_role`; do not add a parallel evidence-link table without a concrete
  need.
- Test outcomes already have a canonical target: a teacher-recorded observation
  linked by `observations.linked_test_id` and
  `activity_tests.outcome_observation_id`.
- No precise learner age is available. Grade level can be shown as context, but
  must not be presented as a verified age.
- The evidence-summary route still returns `501 NOT_IMPLEMENTED`; the evidence
  page and several card components remain placeholders/mock data.
- The Dira MCP server still does not expose a test-suggestion or evidence-summary
  tool.
- `teacher_reviews`, `teacher_review_observations`, and `teacher_review_tests`
  belong to the legacy pathway-note flow. Repository references remain in schema,
  synthetic-data generation/cleaning/import, and architecture documentation.
- The separate observation transcription-review lifecycle
  (`teacher_review_status`, `reviewed_observation`, and
  `observation_review_history`) is active product behavior and is **not** the
  legacy pathway-note feature. It must not be deprecated or removed as part of
  this work.
- `db/002_agent_activity_logs.sql` is an unrelated agent-logging migration and
  does not add test-suggestion fields. Its `002` filename also means the new
  activity-test migration must use an unambiguous, unique migration identifier
  consistent with the repository's actual migration application process.

## Proposed implementation phases

### Phase 1 — Confirm lifecycle and safely align schema

**Likely files:** uniquely versioned additive migration under `db/`,
`lib/db/dataset_schema.sql`, `lib/db/schema.ts`,
`lib/mcp-tools/suggestTest.ts`, `scripts/seed-development.cjs`,
synthetic-data generation/cleaning as needed, `docs/reference/DATA_MODEL.md`,
and data migration tests.

**Work**

- Reconcile the schema with fields already expected by the merged service,
  including `approval_submission_id` (unique idempotency key) and
  `suggestion_payload` (structured snapshot of the accepted suggestion), as well
  as the additional fields described below. Define which normalized columns are
  authoritative and which payload values are retained for reproducibility; avoid
  silently maintaining duplicate, conflicting facts.
- Update the seed importer and generated CSV contract to read/write every
  persisted column and relationship that this flow now requires. Keep optional
  legacy pathway-note CSV handling separate from the test/evidence contract.
- Update the merged service and its callers to use the approved uppercase
  persisted statuses. Do not persist transient `proposed` or evidence-signal
  statuses as test lifecycle values.
- Align the status constraint to `SUGGESTED`, `ACCEPTED`, and `COMPLETED` with
  explicit transition and outcome-link invariants.
- Keep outcome observations as the canonical test result; do not create a second
  competing result record.
- Preserve `supersedes_test_id` lineage so regeneration never silently overwrites
  the rejected suggestion.
- Update the canonical fresh-database schema and add a separately applicable,
  additive migration for existing development databases. Do not assume Compose
  initialization mounts upgrade an existing PostgreSQL volume.
- Before migrating existing test rows, inspect actual status distribution and
  linked outcomes. Map only rows whose meaning is certain. In particular, do not
  guess that legacy `Pending` means the new user-defined `SUGGESTED`; stop for
  explicit data review or an approved mapping if its meaning is ambiguous.
- Ensure `COMPLETED` always has a teacher-recorded linked outcome and that
  `ACCEPTED` has no completion timestamp until that outcome is saved.
- Add tests for fresh schema, migration, safe status mapping, and same-learner
  references.

**Fields to add or align**

- `exploration_question`
- `reason`
- `purpose`
- `estimated_minutes` and/or `estimated_effort`
- `what_to_observe`
- `what_to_log_after`
- `limitations`
- `retrieval_status` with a constrained vocabulary for **external-source
  retrieval only**, separate from suggestion-result states and persisted test
  lifecycle states. Proposed values are `success`, `no_relevant_results`,
  `timeout`, `provider_error`, and `not_configured`; finalize after the retrieval
  adapter's result contract is designed. If retrieval is per source, preserve
  per-source outcomes in the suggestion payload/result rather than implying one
  aggregate status means all four sources succeeded.
- `accepted_at`
- `completed_at`
- `supersedes_test_id`
- A durable relationship from each persisted test to the exact observations
  considered as supporting, contradicting, or contextual evidence. Reuse the
  existing `activity_test_observations` relation populated by the merged
  acceptance flow; decide whether adding a constrained `citation_role` is
  necessary. Do not add a duplicate relation or rely solely on unvalidated JSON
  IDs.
- `approval_submission_id` and `suggestion_payload` as required by the merged
  persistence code, subject to the normalization/authority decision above.

**Gate:** approved state semantics, reconciled service/schema/importer contracts,
and an audited migration mapping for existing rows. No ambiguous legacy value is
silently reinterpreted; all new writes use uppercase lifecycle values.

### Phase 2 — Deprecate the legacy pathway-note flow in documentation and data tools

**Likely files:** `ARCHITECTURE.md`, `docs/reference/DATA_MODEL.md`,
`docs/reference/MCP_TOOLS.md`, synthetic-data generator and cleaner/importer only
where needed to stop creating new legacy records.

**Work**

- Mark `teacher_reviews`, `teacher_review_observations`, and
  `teacher_review_tests` as deprecated legacy pathway-note structures.
- Do not drop these tables, delete rows, or remove their constraints in this
  implementation.
- Inspect and document every repository caller before changing a data-generation
  or import path. Stop creating new legacy pathway-note data if that can be done
  without breaking reproducibility or existing development datasets.
- Clearly distinguish those legacy note-review tables from the active
  observation transcription-review workflow and its review-history table.
- Defer physical removal to a separate approved migration after callers, stored
  data, and retention requirements have been reviewed.

**Gate:** repository caller inventory is documented; no active UI/API path still
depends on legacy pathway-note approval behavior.

### Phase 3 — Add bounded retrieval from the four approved education sources

**Likely files:** educational retrieval adapter under `lib/`, hard-coded source
list inside the evidence-summary/assessment function, tests and integration docs.

**Work**

- Keep the requested four-source list hard-coded as a local variable in the
  function that assembles evidence and assesses the question/hypothesis. Do not
  introduce a source registry table or make source selection an uncontrolled
  model choice.
- Keep educational retrieval outcomes in a distinct result contract. The current
  merged `SuggestTestResult.status` values describe whether local evidence can
  support a suggestion; they do not report whether IB/EEF/AMI/WWC were queried.
  Do not rename or overload these statuses to represent retrieval.
- Use a bounded retrieval mechanism to find relevant official pages beneath
  those starting URLs. The implementation approach (official site search,
  permitted page retrieval, or another verified retrieval method) must be tested
  against each site; a homepage URL by itself is not retrieval.
- Restrict fetched links to the listed official domains, apply timeouts and
  response-size limits, and make retrieval success/failure explicit.
- Query with the educational question and non-identifying teaching context only.
  Do not send learner names, IDs, contact data, raw observations, or other learner
  personal data to public-source retrieval.
- Return source title, exact page URL, publisher/key, retrieval time, and the
  relevant short passage or summary needed to support attribution.
- Cite only sources actually retrieved for this run. Never claim all four sources
  were consulted if some could not be reached or yielded no relevant material.
- Distinguish no relevant result, timeout, provider/site failure, malformed
  content, and success. On retrieval failure, continue only under the approved
  fallback behavior and label the assessment as lacking retrieved external
  guidance.
- Do not scrape or reproduce large copyrighted passages. Keep excerpts minimal
  and attributed; prefer concise paraphrase linked to the source page.

**Gate:** a test demonstrates actual bounded retrieval from each approved source
or records that source as unavailable; source citations resolve to the retrieved
pages and contain no learner PII.

### Phase 4 — Implement test suggestion and cautious evidence assessment

**Likely files:** test/evidence services under `lib/services/`, validators, model
prompt/adapter, focused unit tests.

**Work**

- Build a scoped, time-bounded evidence bundle from original teacher observations,
  teacher-reviewed observations according to explicit policy, prior tests,
  linked outcomes, and attendance/context only where relevant and approved.
- Start from and retain the merged deterministic `suggestTest` evidence-selection
  and corroboration logic. Review its thresholds, duplicate heuristic, status
  contracts, and same-evidence open-test suppression against product requirements;
  extend through focused tests instead of discarding it without evidence.
- Keep the existing pure `proposed`/`needs_review`/`insufficient_evidence` style
  return outcomes as transient service outcomes. Track educational-source
  retrieval independently and attach its safe per-source status/citations to the
  generated suggestion result and, where needed for an accepted test, its
  reproducible payload.
- Preserve provenance and distinguish direct teacher observations, teacher-edited
  versions, test outcomes, and generated interpretation.
- Generate a practical, low-preparation test suggestion with every required field:
  question, rationale, activity, purpose, estimated effort/time, observable
  behaviors, what the teacher should record, evidence links, and limitations.
- Include the fixed four-source list in the function that performs the summary
  and assessment, and pass only retrieved, relevant, attributed source material
  into model reasoning.
- Assess a hypothesis/question as an inquiry about the evidence, not as a verdict
  about the learner. Report evidence that supports, contradicts, or does not yet
  address it; identify gaps, context, recency, and limitations.
- Use cautious workflow labels such as `INSUFFICIENT_EVIDENCE`,
  `QUESTION_TO_EXPLORE`, and `EVIDENCE_REASSESSED`. Do not store an LLM-generated
  support status as a permanent learner trait or fixed classification.
- Present conclusions as provisional, cite the underlying observation/test IDs
  and source pages, and require teacher judgement. Never fabricate events,
  outcomes, source use, citations, or certainty.
- Make generation idempotent where a request can be retried; do not persist a
  generated test as accepted until the teacher accepts it.

**Gate:** tests prove that every assessment claim traces to supplied observations,
test outcomes, or retrieved source material, and that contradictory/insufficient
evidence is represented rather than smoothed away.

### Phase 5 — Implement teacher choice and outcome lifecycle

**Likely files:** learner test/suggestion routes and services, observation logging
integration, validators, tests.

**Work**

- Provide explicit teacher actions to accept a test or request regeneration.
- Reuse and correct the merged `acceptSuggestion` idempotency and persistence flow
  rather than adding a second acceptance implementation. Align its title-case
  `Accepted` writes/returns and legacy prior-test comparisons with the uppercase
  product lifecycle.
- Persist a rejected-and-regenerate suggestion as `SUGGESTED`, retain its
  evidence/source references and link the successor; persist a selected test as
  `ACCEPTED`.
- Record the accepting teacher and timestamps from trusted server context, not
  model-generated or client-supplied identity.
- When recording the test outcome, create the teacher-authored observation with
  `linked_test_id`, set the canonical outcome link, and transition to `COMPLETED`
  transactionally.
- Preserve original observation wording and the existing separate observation
  review history. Do not let the model write or confirm teacher outcomes.
- Prevent completion without an outcome and prevent duplicate results on retry.

**Gate:** exercise accept, reject/regenerate, replacement linkage, outcome save,
duplicate submission, and failure rollback against the development schema.

### Phase 6 — Build the Learner Evidence Card and expose approved MCP capability

**Likely files:** evidence page and card components, evidence-summary route,
`lib/mcp-tools/` registry, documentation, UI/accessibility tests.

**Work**

- Replace hard-coded mock data and placeholder components with data loaded for the
  authorized learner/teacher context.
- Show concise evidence overview, questions explored, suggested/accepted/completed
  tests, observed outcomes, evidence supporting/contradicting the question,
  source attribution, recency, and limitations.
- Keep the original teacher observation and any teacher edit distinguishable from
  generated summaries. Link card claims back to their source records.
- Display grade level only as a grade context; do not infer or display exact age.
- Add an evidence-summary MCP tool using the same validated service and scoped
  inputs as the application route. The route and MCP tool must not implement
  separate assessment rules.
- Decide whether the existing merged `suggestTest` service should be exposed as a
  separate `suggest_test` MCP tool or remain an internal operation called by
  `build_evidence_summary`; do not claim either tool is already registered.
- Define read/write boundaries: summary assessment is read-only; test acceptance,
  regeneration, and outcome recording are explicit validated teacher actions.
- Provide clear empty, retrieval-unavailable, insufficient-evidence, loading, and
  error states. Keep the card useful without implying a learner diagnosis.
- Update the MCP tool reference, data model, architecture, and user-flow docs.

**Gate:** teacher can trace each assessment and suggestion to exact evidence and
retrieved pages, and all writes follow the accepted lifecycle with teacher review.

### Phase 7 — Verification and operational handoff

**Work**

- Run migration and integration checks against a guarded local development
  database; keep production builds independent of integration-test failure.
- Verify cross-learner and cross-teacher scoping, untrusted IDs, duplicate
  requests, missing/outdated schemas, and inaccessible source sites.
- Test source outage, no relevant results, conflicting sources, stale/contradictory
  observations, incomplete test outcomes, teacher rejection/regeneration, and
  model timeout/malformed output.
- Verify no learner PII is sent to educational websites and no sensitive
  observation text, credentials, or private model reasoning enters logs.
- Document actual source retrieval coverage and limitations; do not call an
  untested source integration complete.

## Cross-cutting safety and data rules

- Teacher observations remain source evidence; generated summaries are
  interpretations, not replacements.
- Do not infer diagnosis, ability, learner identity, age, attendance, or an
  unrecorded test outcome.
- Retrieve external education guidance with non-identifying queries only.
- Cite only content actually retrieved, with exact source URLs and concise
  attribution.
- Keep evidence assessment on-demand/derived unless a separately approved
  requirement justifies snapshots. If snapshots are later added, retain model and
  prompt version, assessment time, and source evidence references so they can be
  regenerated and audited.
- Deprecating the legacy pathway-note tables does not deprecate current teacher
  review of an observation or make model output teacher-approved.

## Approval checklist

- [ ] Approve the three requested activity-test statuses and the specified
  `SUGGESTED`/regeneration semantics, including the transient pre-choice proposal
  behavior.
- [ ] Approve migration handling for existing `Pending` rows only after their
  meaning and linked outcomes are inspected.
- [ ] Approve the four official source starting URLs and bounded retrieval scope.
- [ ] Approve the non-identifying retrieval rule and source-attribution format.
- [ ] Approve the additive activity-test fields and relational evidence links.
- [ ] Approve documentation deprecation of pathway-note tables while retaining
  the tables and existing data.
- [ ] Approve the implementation phases before code changes begin.
