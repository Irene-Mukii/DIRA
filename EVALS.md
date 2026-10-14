# Evaluation Documentation
# Evaluation criteria and results for the system

## Evaluation plan (not results)

The scenarios below define the acceptance checks. A planned or blocked check is
not a pass. `PASS` applies only to the scope named in the actual-results record;
it does not imply live production readiness. Tests that need PostgreSQL, a
running MCP server, external network access, or provider credentials must state
which of those dependencies were actually available.

The follow-up evaluation should include an authenticated, non-demo deployment
only after caller identity and administrator authorization are implemented.
Never use production learner data for test fixtures. Use synthetic data,
loopback `dira_dev`, and read-only calls where possible.

## Executed evaluation results

### Ten behavioral scenarios

#### 1. Normal observation

- **Objective / risk:** Verify that a normal Suggest Test run uses retrieved
  learner evidence and validated source context, then persists only a valid
  suggestion.
- **Test level / prerequisites:** Integration test with mocked MCP/model
  providers; no live credentials or learner database required.
- **Command / procedure:** `npm run test:suggest-test`; test
  `LangGraph Suggest Test workflow > uses the in-process MCP evidence, history,
  retrieval, and persistence tools with retrieved context`.
- **Expected:** The workflow retrieves the required context, uses the graph
  stages, validates the generated suggestion, and persists it once.
- **Actual / status:** The focused workflow test passed. **PASS** for this
  mocked integration path; no manual end-to-end learner workflow was run.
- **Evidence / limitations / follow-up:** `npm run test:suggest-test` completed
  with 29 passed and 1 opt-in integration test skipped. Repeat against a safe
  seeded development database when full application-level verification is
  needed.

#### 2. Missing evidence

- **Objective / risk:** Ensure a workflow does not infer an outcome or create
  an evidence assessment when required recorded evidence is absent.
- **Test level / prerequisites:** Unit test with model and retrieval calls
  observable through mocks.
- **Command / procedure:** `npm run test:suggest-test`; test
  `evidence reasoning > does not call the model or retrieval when the test has
  no recorded outcome`.
- **Expected:** No model call, retrieval, or unsupported assessment is made.
- **Actual / status:** The test passed and observed no model/retrieval call.
  **PARTIAL** because it covers the evidence-reasoning no-outcome path, not
  every Suggest Test input with missing learner evidence.
- **Evidence / limitations / follow-up:** Add a dedicated empty-observation
  Suggest Test scenario and verify the public tool response is explicit.

#### 3. State-dependent tool selection

- **Objective / risk:** Confirm the agent selects only tools permitted by the
  current workflow state and does not skip required checks.
- **Test level / prerequisites:** Not run; requires tests over the scheduled
  agent's state branches and permitted tool inventory.
- **Command / procedure:** Planned: `npm run test:follow-ups` plus a focused
  orchestrator test that asserts the exact discovered/called tools for each
  state.
- **Expected:** Read/prepare/dispatch tools are selected only for their
  matching trigger and state; state-changing calls remain bounded.
- **Actual / status:** No state-dependent scheduled-agent selection test was
  executed in this evaluation. **NOT TESTED**.
- **Evidence / limitations / follow-up:** Do not infer this behavior from the
  configured tool list or source inspection alone; add and execute the focused
  tool-selection tests.

#### 4. Tool failure

- **Objective / risk:** Ensure a tool/provider failure is reported and does not
  produce a success-shaped fallback proposal.
- **Test level / prerequisites:** Mocked graph test; external MCP endpoint and
  local database for the separate live smoke procedure.
- **Command / procedure:** `npm run test:suggest-test`; test
  `LangGraph Suggest Test workflow > propagates a model outage and does not
  save a fallback proposal`. Also ran `npm run mcp:test:external`.
- **Expected:** The model outage propagates as failure without persistence;
  retrieval tool invocation returns a valid structured result whose source
  failures remain visible.
- **Actual / status:** The mocked model-outage test passed. The external MCP
  client discovered 13 tools and invoked education retrieval, which returned
  `failed` with four source failures. **PASS** for failure propagation and
  protocol response shape; live content retrieval did not succeed.
- **Evidence / limitations / follow-up:** IB returned 403, EEF 404, AMI
  `response_too_large`, and WWC `content_extraction_failure`. No source-access
  error was bypassed.

#### 5. Recoverable timeout

- **Objective / risk:** Verify a timed-out optional Fetch MCP refresh preserves
  a safe retrieval result and does not mark stale content fresh.
- **Test level / prerequisites:** Unit test with a stale metadata record,
  direct retrieval response, and Fetch MCP timeout mock.
- **Command / procedure:** `npm run test:suggest-test`; test
  `education source retrieval > falls back to safe direct content when a stale
  cache refresh fails`.
- **Expected:** The Fetch timeout is logged as a failed refresh; direct
  validated content may be returned; the old Markdown is not refreshed or
  overwritten.
- **Actual / status:** The test passed; direct evidence was returned, Fetch was
  called once, and cache save was not called. **PASS** for this mocked
  recoverable timeout.
- **Evidence / limitations / follow-up:** A real Fetch MCP timeout/recovery
  integration was not run because `uvx.exe` was unavailable.

#### 6. Conflicting evidence

- **Objective / risk:** Ensure contradictory learner evidence remains visible
  and is not collapsed into an unsupported conclusion.
- **Test level / prerequisites:** Not run; requires a synthetic fixture with
  contradictory linked observations/outcomes.
- **Command / procedure:** Planned: add a focused fixture and run
  `npm run test:suggest-test`, then inspect the persisted structured result.
- **Expected:** Contradictions are reported as such; the agent asks for further
  evidence or returns an inconclusive result rather than inventing a resolution.
- **Actual / status:** No dedicated conflicting-evidence scenario was
  executed. **NOT TESTED**.
- **Evidence / limitations / follow-up:** Existing evidence reasoning tests
  validate supplied references but do not demonstrate the requested
  contradiction handling.

#### 7. Unsupported claim

- **Objective / risk:** Prevent fabricated citations or claims unsupported by
  the retrieved evidence from being persisted.
- **Test level / prerequisites:** Mocked graph with an invalid citation followed
  by a bounded retry.
- **Command / procedure:** `npm run test:suggest-test`; tests
  `LangGraph Suggest Test workflow > retries once when a generated citation is
  not among retrieved sources` and `> never persists when output remains
  invalid after the bounded retry`.
- **Expected:** Invalid citations are retried once; if still invalid, no
  suggestion is persisted.
- **Actual / status:** Both tests passed. **PASS** for citation validation and
  bounded persistence protection.
- **Evidence / limitations / follow-up:** This does not prove every
  natural-language educational claim is grounded; review generated language
  in a separate qualitative evaluation.

#### 8. Approval bypass

- **Objective / risk:** Ensure the agent cannot bypass teacher approval or
  transition a proposal without the authorized acceptance operation.
- **Test level / prerequisites:** Not run; requires an authorization-focused
  API/MCP test that attempts prohibited transitions.
- **Command / procedure:** Planned: add a negative authorization test for each
  state-changing approval path, then run `npm run test:suggest-test`.
- **Expected:** The model/caller cannot mark an unapproved suggestion accepted
  or bypass server-side validation.
- **Actual / status:** No dedicated approval-bypass test was executed.
  **NOT TESTED**.
- **Evidence / limitations / follow-up:** External MCP authorization is a
  shared demo bearer token, not production user authentication; production
  approval controls remain a prerequisite.

#### 9. Agent self-approval

- **Objective / risk:** Ensure an agent cannot approve its own generated
  suggestion or call-observation draft.
- **Test level / prerequisites:** Not run; requires an attempted self-approval
  through each relevant public and internal interface.
- **Command / procedure:** Planned: attempt self-approval with a synthetic
  agent-run identity and assert the server denies it; run the relevant API/MCP
  and database tests.
- **Expected:** Approval remains a distinct authorized human action; agent
  output remains a proposal or unconfirmed draft.
- **Actual / status:** No self-approval scenario was executed. **NOT TESTED**.
- **Evidence / limitations / follow-up:** Do not treat a UI label or tool
  boundary as proof of authorization; add explicit negative tests before
  production.

#### 10. Audit reconstruction

- **Objective / risk:** Reconstruct a workflow from persisted, correlated
  events without relying on private chain-of-thought or transient console logs.
- **Test level / prerequisites:** PostgreSQL migrations 002 and 009, a known
  `run_id`, and a populated activity log.
- **Command / procedure:** Planned: query
  `agent_activity_logs` by `run_id`, order by timestamp/id, and compare every
  event to the run output and UI.
- **Expected:** Run, model, tool, cache, and failure events share the same run
  ID and sufficient timestamp/status metadata to reconstruct execution.
- **Actual / status:** No persisted-event reconstruction was completed. The
  browser page `/agent-logs` rendered, but showed 0 records; therefore row
  accuracy and reconstruction remain **NOT TESTED**.
- **Evidence / limitations / follow-up:** The UI screen load alone does not
  prove database persistence or correct authorization. Re-run with a known
  test `run_id` after confirming database connectivity.

### Implementation-specific evaluations

#### Automatic scheduled execution and duplicate-trigger protection

- **Objective / risk:** Verify a deployed scheduler starts runs on the intended
  schedule and retries/duplicate triggers do not duplicate work.
- **Test level / prerequisites:** Deployment/manual verification; external
  scheduler, protected trigger secret, local or staging PostgreSQL, and a
  controlled schedule fixture.
- **Command / procedure:** Planned: configure the external scheduler to call
  `POST /api/internal/follow-up-agent` with either
  `{"trigger":"prepare_queue"}` or `{"trigger":"dispatch_due"}`, then replay a
  trigger and inspect durable queue state.
- **Expected:** The intended jobs run once; database idempotency and dispatch
  claims prevent duplicate work; run IDs and failures are visible.
- **Actual / status:** No hosting scheduler is configured and no automatic
  execution was observed. The protected trigger exists; queue idempotency is
  implemented in the existing database flow but was not revalidated here.
  **NOT TESTED**.
- **Evidence / limitations / follow-up:** An operator must select and verify a
  scheduler, retry policy, secret rotation, timezone, and duplicate-trigger
  behavior before claiming scheduled operation. Cache cleanup is a separate
  hourly maintenance timer, not a follow-up scheduler.

#### Independent external MCP discovery and invocation

- **Objective / risk:** Verify an independent client can authenticate, discover
  Dira tools, validate the retrieval schema, and invoke the read-only retrieval
  tool without learner writes.
- **Test level / prerequisites:** Live protocol smoke test; local Dira MCP
  endpoint, `DIRA_MCP_SERVER_URL`, `DIRA_MCP_ACCESS_TOKEN`, server runtime, and
  network access to education sources.
- **Command / procedure:** `npm run mcp:test:external`.
- **Expected:** Streamable HTTP discovery advertises the tools; the client
  invokes `retrieve_education_resources` and receives the expected structured
  shape.
- **Actual / status:** The command passed on 2026-10-14, discovered 13 tools,
  and invoked retrieval with a valid four-source response. **PARTIAL**:
  protocol/discovery/invocation passed, but all four source retrievals failed
  in that live run (IB 403, EEF 404, AMI oversized, WWC extraction failure).
- **Evidence / limitations / follow-up:** Command output reported durations
  1.3–3.7 seconds. The shared bearer token resolves to a server-selected demo
  teacher and does not authenticate the MCP caller as an individual.

#### Fetch MCP cache hit, miss, refresh, failure, and 14-day freshness

- **Objective / risk:** Verify relevant fresh cache entries avoid source URL
  discovery and Fetch MCP; misses and stale entries preserve the existing
  retrieval flow; successful Markdown is cached for 14 days; failures do not
  replace content or extend freshness.
- **Test level / prerequisites:** Unit tests and an opt-in live integration;
  live integration additionally requires local `dira_dev`, migrations 002/009,
  network access, and `uvx`.
- **Command / procedure:** `npm run test:suggest-test`; intended live command:
  set `RUN_FETCH_MCP_INTEGRATION=true`, `FETCH_MCP_ENABLED=true`, and
  `FETCH_MCP_COMMAND` to `uvx.exe`, then run `npm run test:fetch-mcp`.
- **Expected:** A relevant fresh cached page avoids sitemap, robots, page, and
  Fetch MCP requests; no relevant cache match continues through existing
  discovery and exact-page cache behavior; only validated new content is
  stored; expiry purges the body at 14 days but retains metadata.
- **Actual / status:** Unit tests passed for validated cache write, cache hit,
  cache-first retrieval without source URL requests, fallback to discovery when
  cached pages are irrelevant, timeout fallback, size/hash validation, and SQL
  freshness/expiry semantics. The focused retrieval/cache run passed 13 tests.
  **PARTIAL** because the opt-in live test was not run: `Get-Command uvx.exe`
  failed because `uvx.exe` is not installed or on `PATH`.
- **Evidence / limitations / follow-up:** Use the test command above after
  installing/configuring `uvx`; do not infer a real provider/cache round trip
  from the mocked tests.

#### PostgreSQL Markdown storage and large-content handling

- **Objective / risk:** Verify the configured maximum Markdown fits PostgreSQL
  and metadata reads do not unnecessarily load the body.
- **Test level / prerequisites:** Manual local PostgreSQL verification on
  `dira_dev` after migrations 002/009.
- **Command / procedure:** Stored a 128,000-byte Markdown value in a local
  transaction; checked fresh versus 14-day-stale timestamps; ran the expiry
  update and verified body nulling with metadata retained.
- **Expected:** The configured maximum stores intact, cache lookups apply the
  freshness boundary, and expiry retains audit metadata without serving stale
  content.
- **Actual / status:** All checks passed on local `dira_dev`. **PASS** for the
  configured maximum and access pattern. Migration 009 was applied and rerun
  successfully to verify idempotent schema application.
- **Evidence / limitations / follow-up:** This was a local database check; it
  did not measure production-scale table growth, throughput, backup size, or
  retrieval latency under load.

#### Model usage capture and cost calculation

- **Objective / risk:** Ensure returned token usage is captured and cost is not
  reported as zero when usage or pricing is unknown.
- **Test level / prerequisites:** Unit tests with mock GLM responses; no live
  provider credentials required.
- **Command / procedure:** `npm run test:suggest-test`; tests
  `GLM completion requests > captures provider token usage when the response
  includes it`, `model usage cost calculation > applies separate input,
  cached-input, and output rates`, and `> marks missing usage and unknown model
  rates as unpriced`.
- **Expected:** Token counts are persisted; known rates produce a reproducible
  estimate; missing usage/unknown rates produce `unknown`, not zero.
- **Actual / status:** All listed tests passed. **PASS** for mocked usage and
  formula behavior; no live provider billing comparison was performed.
- **Evidence / limitations / follow-up:** GLM-5.3 Flash rates in code are
  USD 0.15/million uncached input, USD 0.03/million cached input, and USD
  0.50/million output, from the Z.AI pricing page observed 2026-10-14. The
  stored date/version identifies the rate snapshot. These values measure
  estimated model-token charges only, not hosting, PostgreSQL, network, or
  Fetch-related infrastructure costs.

#### Frontend agent-log accuracy and authorization

- **Objective / risk:** Verify the UI displays persisted event/model/cost fields
  accurately and is not exposed without the expected authorization.
- **Test level / prerequisites:** Manual browser verification with a known
  persisted run; development server, migrations, and demo context.
- **Command / procedure:** Open `http://localhost:3000/agent-logs`, refresh,
  compare a known `run_id` with the database/API, then test production
  authorization separately.
- **Expected:** Rows and filters match stored events; cost/usage fields reflect
  the persisted values; unauthorized users cannot access logs.
- **Actual / status:** The page rendered with filters, columns, and the
  development/demo warning, but displayed 0 records. **PARTIAL** for rendering
  only; row accuracy and production authorization were not verified.
- **Evidence / limitations / follow-up:** No screenshot or known populated
  `run_id` comparison was retained. The route still uses the demo teacher
  context; implement and test authenticated administrator authorization
  before production exposure.

#### Regression coverage for existing functionality

- **Objective / risk:** Detect regressions in the existing Suggest Test graph,
  evidence reasoning, retrieval, model adapter, and cache/cost helper behavior.
- **Test level / prerequisites:** Focused unit/integration suite; mocked
  providers and no full deployment.
- **Command / procedure:** `npm run test:suggest-test`; additionally
  `npm exec tsc -- --noEmit`.
- **Expected:** Existing focused tests and type checking pass; the opt-in live
  Fetch integration remains skipped unless explicitly enabled.
- **Actual / status:** 7 test files passed, 1 opt-in test file was skipped;
  30 tests passed and 1 was skipped. TypeScript completed with exit code 0.
  **PASS** for the focused regression/type-check scope.
- **Evidence / limitations / follow-up:** This is not a full Next production
  build, browser E2E run, or live provider test. Keep the skipped integration
  test explicitly unverified until its prerequisites are available. The
  evidence-reasoning tests also cover unchanged reassessment output, and
  validation failures now log safe issue codes/paths per attempt without
  recording the model response or learner evidence.

#### Direct retrieval versus Fetch MCP justification

- **Objective / risk:** Determine whether Fetch MCP materially improves
  extraction, reliability, latency, interoperability, or maintenance compared
  with Dira's existing direct HTTP/extraction path.
- **Test level / prerequisites:** Manual controlled comparison of the same
  WWC query/source, plus the independent MCP smoke test; public network access.
- **Procedure:** Compare direct retrieval and Fetch MCP against the same WWC
  content with a synthetic sitemap, record extracted text and elapsed time;
  separately run `npm run mcp:test:external` against the live configured sources.
- **Expected:** Fetch provides readable Markdown without weakening Dira's
  source allowlist, URL validation, size limits, or failure reporting; measured
  latency and failure categories determine whether it improves the baseline.
- **Actual / status:** Direct retrieval returned relevant WWC content in about
  1.25 seconds; Fetch MCP returned about 981 characters in about 3.16 seconds.
  The live external smoke run then failed for all four configured sources.
  **PARTIAL**: standard MCP interoperability and a successful controlled
  extraction were observed, but no latency or live reliability improvement was
  demonstrated.
- **Evidence / limitations / follow-up:** The controlled comparison used a
  synthetic sitemap; a reusable run ID/log artifact was not retained. A 403,
  404, oversized response, timeout, or extraction failure can still occur.
  Fetch MCP is retained as an optional, cache-backed extraction provider, with
  Dira's existing direct path and source safeguards preserved. Re-run a
  representative controlled source set before claiming improved reliability.

## Outstanding blockers and acceptance gaps

- The real Fetch MCP/PostgreSQL integration test remains unverified because
  `uvx.exe` was unavailable on this machine.
- Automatic follow-up scheduling is not configured; the protected trigger is
  not evidence of automatic execution.
- Production MCP caller identity and authenticated administrator log access
  remain deferred.
- Conflicting evidence, approval bypass, agent self-approval, and persisted
  audit reconstruction still require dedicated tests.
- Live education retrieval remained unsuccessful for all four sources in the
  external MCP smoke run; document this limitation rather than claiming Fetch
  MCP resolves those failures.