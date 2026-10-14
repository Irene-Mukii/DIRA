# Dira evaluation record

**Audit date:** 2026-10-14
**Scope:** Repository implementation, focused mocked/unit suite, and TypeScript
type-check. No production database, provider account, deployed endpoint, or
live third-party MCP call was exercised for this audit.

Statuses mean: `PASS` = the named behaviour was demonstrated by an executed
test; `PARTIAL` = only part of the behaviour was demonstrated; `FAIL` = an
executed test or reproducible check demonstrates the criterion is not met;
`NOT TESTED` = no adequate test was executed; `UNVERIFIED` = available evidence
does not establish the result. A passing unit test does not establish a live
integration or production guarantee.

## 1. Purpose and evaluation scope

Dira's evaluated workflow is a teacher-facing evidence loop: record an
observation, propose a classroom activity from reviewed evidence, let a teacher
decide what to try, and retain the recorded result. The agent must not diagnose,
rank, or assign a learner a pathway.

This record evaluates the code and tests currently in the worktree, including
the current focused test run. It does not certify production readiness,
provider availability, real teacher authentication, or system-wide reliability.
No learner records were created or changed, and no live SMS, call, model, or
education-source request was made during this audit.

## 2. Environment and prerequisites

- Node dependencies were already installed in the repository.
- The focused test suite uses the explicit include list in
  `vitest.unit.config.mjs`. The model, database, voice-provider and retrieval
  behaviours it tests are mocked or otherwise isolated; its opt-in
  `tests/fetch-mcp.integration.test.mjs` case was skipped.
- The full `npm run test:follow-ups` suite is not equivalent to the focused
  suite. Its global setup requires `DIRA_TEST_DATABASE_URL` targeting local
  `dira_dev` as user `dira_dev` on port 5433, and follow-up tests insert and
  clean up database fixtures. It was not run because it has database side
  effects.
- Live GLM, OpenAI, Africa's Talking, public MCP, Keeper, and Fetch MCP checks
  require their respective credentials, endpoints, network access, and—in the
  Fetch/PostgreSQL case—local database and `uvx`. These were not exercised here.
- Do not use production learner data for evaluation. Use synthetic records and
  an isolated local database only after confirming the test target.

## 3. Test execution instructions and observed run

Commands executed on 2026-10-14:

| Command | Observed result |
|---|---|
| `npm run test:suggest-test` | Exit 0; 12 test files passed, 1 skipped; 52 tests passed, 1 skipped. The skipped test is the opt-in Fetch MCP/PostgreSQL integration. |
| `npm exec tsc -- --noEmit` | Exit 0; no TypeScript diagnostics were printed. |

The focused suite covers retrieval/cache behavior, evidence reasoning,
mocked model requests and cost calculation, voice configuration/demo routes,
staging-import validation, the Suggest Test workflow, and registration of the
public Dira MCP tools. It is not a full browser E2E run, a production build, or
a live-provider test.

Not run: `npm run test:follow-ups`, `npm run mcp:test:external`, `npm run mcp:test`,
`npm run build`, live provider requests, and database-backed audit
reconstruction. The external MCP smoke script invokes live education
retrieval; no such external request was necessary to establish the focused
suite's result.

## 4. Test inventory and coverage

The 13 files selected by `vitest.unit.config.mjs` are:

- `tests/education-retrieval.test.mjs`
- `tests/education-markdown-cache.test.mjs`
- `tests/fetch-mcp.integration.test.mjs` — `retrieves and caches an approved public source, then serves a cache hit` (opt-in; skipped)
- `tests/evidence-reasoning.test.mjs`
- `tests/models.test.mjs`
- `tests/model-cost.test.mjs`
- `tests/voice-config.test.mjs`
- `tests/internal-demo-voice-route.test.mjs`
- `tests/public-demo-voice.test.mjs`
- `tests/demo-call-route.test.mjs`
- `tests/seed-staging-import.test.mjs`
- `tests/suggest-test.test.mjs`
- `tests/suggest-test-graph.test.mjs`

The separate `lib/mcp-tools/suggestTest.test.ts` file is not in the focused
config's include list and was not run. Its existence is not a test result.
Likewise, passing tests use mocks where specified and do not establish
PostgreSQL or provider behaviour outside those test boundaries.

### Behavioural evaluation scenarios

These scenarios are separate from the aggregate unit-test count above. Each row
states the intended result and the observed evidence. `PARTIAL` means a named
test passed only for the explicitly described mocked or bounded behaviour; it
does not mean the complete challenge criterion passed. No behavioural scenario
in this table has a full `PASS`.

| # | Scenario and expected result | Exact existing test or inspection | Observed result and limits | Status |
|---|---|---|---|---|
| 1 | **Normal observation:** a valid teacher observation is persisted once with its original content and a real returned ID. | No focused `log_observation` persistence test was run. | No observation write was verified in this audit. A graph test or tool registration is not evidence of a database-backed observation write. | `NOT TESTED` |
| 2 | **Missing evidence:** an accepted test without a recorded outcome is not assessed, and the model/retrieval are not called. | `tests/evidence-reasoning.test.mjs` — `evidence reasoning > does not call the model or retrieval when the test has no recorded outcome` | Passed with mocked database, model, and retrieval dependencies for an accepted test lacking an outcome. It does not test Suggest Test with zero observations or prove live database behaviour. | `PARTIAL` |
| 3 | **State-dependent tool selection:** the scheduled agent chooses or withholds tools based on trigger and returned state, and never dispatches without due work. | No scheduled-orchestrator behavioural test is in the focused config. | Source inspection confirms trigger-specific allowlists and a due-count dispatch gate, but no run tested decisions against changed tool results. | `NOT TESTED` |
| 4 | **Model failure:** a model outage is surfaced and no fallback proposal is persisted. | `tests/suggest-test-graph.test.mjs` — `LangGraph Suggest Test workflow > propagates a model outage and does not save a fallback proposal` | Passed with the model completion mocked to reject. It does not test a live provider outage or arbitrary MCP-tool failures. | `PARTIAL` |
| 5 | **Retrieval failure recovery:** a failed optional cache refresh may use independently retrieved direct content, without treating failed refresh content as fresh. | `tests/education-retrieval.test.mjs` — `education source retrieval > falls back to safe direct content when a stale cache refresh fails` | Passed with mocked Fetch MCP/cache and mocked direct HTTP responses. It does not demonstrate a real timeout, provider retry, or recovery from an uncertain write. | `PARTIAL` |
| 6 | **Contradictory evidence:** conflicting records remain visible and are not discarded or resolved into an unsupported conclusion. | `lib/mcp-tools/suggestTest.test.ts` — `retains different reports instead of discarding apparent contradictions`; excluded from `vitest.unit.config.mjs`. | Test exists but was not run. No executed evaluation established how conflicting evidence appears in generated or persisted output. | `NOT TESTED` |
| 7 | **Citation integrity:** unsupported evidence/source references are rejected or retried once; persist only output that passes reference validation. | `tests/suggest-test-graph.test.mjs` — `retries once when a generated citation is not among retrieved sources`; `never persists when output remains invalid after the bounded retry`; `tests/evidence-reasoning.test.mjs` — `fails explicitly when the model fabricates assessment evidence references` | All named tests passed with mocked generation, retrieval, and persistence dependencies. They prove reference-membership checks and bounded retry in those paths, not semantic entailment of every natural-language claim or live ownership checks. | `PARTIAL` |
| 8 | **Approval enforcement:** accepting a proposal requires an individually authenticated teacher decision; the agent cannot self-approve. | No approval-bypass or self-approval test was run. Source inspection finds the legacy `/api/mcp/approve-note` route returns 501; the public accept tool uses the shared demo bearer context. | No authenticated approval guarantee is demonstrated. Suggest Test and scheduled-agent tool allowlists omit acceptance, but those source boundaries do not prove runtime enforcement across the public accept tool. | `UNVERIFIED` |
| 9 | **Independent Dira MCP invocation:** a separate protocol client discovers actual HTTP tool schemas, invokes a tool, and verifies its result/persisted effect. | `tests/suggest-test-graph.test.mjs` — `LangGraph Suggest Test workflow > registers exactly thirteen public Dira MCP tools` | Passed using the SDK `InMemoryTransport`; it proves local registration and discovery of 13 tools, not the HTTP endpoint, independent-client invocation, or a persisted tool effect. The external smoke script was not run. | `PARTIAL` |
| 10 | **Borrowed Keeper MCP:** authenticated MCP discovery and a bounded read-only calendar invocation return genuine data. | Repository search found definitions of `discoverKeeperCalendarTools`, `getKeeperEventCount`, and `getKeeperEvents`, but no application call sites. No live Keeper attempt was made. | The required connection-and-invocation path is absent from the application workflow. This is a repository-confirmed implementation gap, not an observed live-provider failure. Live discovery/invocation remain untested. | `FAIL` |
| 11 | **Open-weights model requirement:** the challenge-required open-weight model executes a qualifying task, with evidence of the actual model and output. | No qualifying live model execution or retained run evidence was found. `tests/models.test.mjs` mocks the HTTP response; it does not establish model execution. | Repository documentation is inconsistent: `ARCHITECTURE.md` labels GLM-5.3 Flash open-weight while identifying hosted Z.AI; `PRODUCT_REQUIREMENTS.md` says the challenge requirement/model choice needs confirmation. This audit has no evidence of an open-weight inference run or confirmation of the exact judging criterion. | `UNVERIFIED` |
| 12 | **Persisted run reconstruction:** a run can be reconstructed from durable correlated events, including model/tool outcomes and failures. | No database-backed reconstruction was executed. | No persisted run was inspected. Source-level logger fields and mocked tests do not establish log durability or reconstructability. | `NOT TESTED` |
| 13 | **Actual per-run cost:** recorded provider usage for a real run is tied to its run ID, priced with the applicable rate, and reconciled against provider billing. | `tests/model-cost.test.mjs` — `applies separate input, cached-input, and output rates`; `marks missing usage and unknown model rates as unpriced`; `tests/models.test.mjs` — `captures provider token usage when the response includes it` | Passed unit tests for the cost formula, unknown-usage handling, and parsing mocked provider usage. These do not establish actual provider usage, persisted run-level cost, billing reconciliation, or total infrastructure cost. | `PARTIAL` |

## 5. Agent autonomy and dynamic tool-use evaluation

There are two materially different agent paths:

1. The request-path Suggest Test LangGraph invokes a fixed sequence of
   supporting MCP tools: retrieve learner observations and history, prepare
   evidence, conditionally retrieve education resources, construct context,
   generate structured output, validate it, retry invalid output once, and
   persist only valid output. It has state-dependent gates, but does not ask
   the model to select arbitrary tools.
2. The scheduled orchestrator asks GLM for function-tool calls. It filters
   tools by trigger, limits model turns and total calls, checks due-job results
   before dispatch, and allows at most one dispatch call. This is bounded
   model-directed tool use in the source. The focused suite does not include an
   orchestrator test proving that the model's actual choices respond correctly
   to changing state.

Therefore, genuine state-dependent selection by the scheduled agent is
**NOT TESTED**. Do not describe the fixed Suggest Test graph as autonomous
tool selection or claim runtime autonomy based only on its graph definition.

## 6. MCP tool contracts and independent reusability

The HTTP route `app/api/mcp/server/route.ts` exposes a stateless Streamable HTTP
server with bearer-token checking and 13 Dira-owned tools. A focused in-memory
SDK test passed and asserted that exactly 13 tools are registered. This proves
the local server registration/discovery contract in that test, not an
independent HTTP client's live discovery or invocation.

The registered tools are `log_observation`, `suggest_test`,
`get_learner_observations`, `get_previous_suggestions`,
`retrieve_education_resources`, `persist_test_suggestion`,
`regenerate_test_suggestion`, `accept_suggested_test`,
`build_evidence_summary`, `prepare_daily_follow_up_queue`,
`list_due_follow_ups`, `dispatch_one_due_follow_up`, and
`save_call_observation_drafts`.

The bearer token is shared; `resolveTeacherContext()` selects a deterministic
demo teacher from the database rather than authenticating the MCP caller as an
individual. This is not production teacher authorization. Also,
`npm run mcp:server` starts a separate stdio server that currently registers
only `log_observation`; it is not the same 13-tool HTTP endpoint.

**Assessment: PARTIAL.** The exact test
`tests/suggest-test-graph.test.mjs` — `LangGraph Suggest Test workflow >
registers exactly thirteen public Dira MCP tools` passed using an in-memory
SDK transport. It proves local tool registration/discovery only. Evidence
still needed: a separate protocol-compatible client must connect to the
running HTTP endpoint, discover its actual schemas, invoke a bounded tool,
and verify the returned result and any intended database effect. The external
smoke script targets Dira's own endpoint and was not run; it would not prove
Keeper integration.

## 7. External MCP integration

Keeper.sh is the intended borrowed calendar MCP server. The repository contains
a Streamable HTTP MCP client and read-only calendar helper functions, but a
repository-wide call-site check found no caller of
`discoverKeeperCalendarTools`, `getKeeperEventCount`, or `getKeeperEvents`.
The client requires an OAuth provider for that integration, and no authenticated
Keeper invocation was executed.

**Assessment: FAIL — the required Keeper connection-and-invocation path is not
wired into an application workflow.** Live Keeper discovery and invocation
remain **NOT TESTED**. A configured URL or helper function alone does not meet
the challenge requirement.

Fetch MCP is a separate, optional education-page extraction backend, launched
over stdio behind Dira's retrieval service when `FETCH_MCP_ENABLED=true`; it is
not Keeper and does not establish the borrowed calendar integration. Its
live/PostgreSQL integration test
`tests/fetch-mcp.integration.test.mjs` — `retrieves and caches an approved
public source, then serves a cache hit` is opt-in and was skipped. Mocked tests
`tests/education-retrieval.test.mjs` — `uses Fetch MCP only for approved pages
and caches validated Markdown` and `serves fresh cached Markdown without
starting Fetch MCP` passed; they verify those mocked adapter/cache paths only.
Live Fetch MCP remains **UNVERIFIED**.

## 8. Evidence grounding and contradictory or missing evidence

The graph's output schema constrains generated activity fields and valid
reference keys; persistence revalidates the proposal and observation ownership
before saving. The exact passing mocked tests are listed in scenario 7:
`tests/suggest-test-graph.test.mjs` — `retries once when a generated citation
is not among retrieved sources` and `never persists when output remains invalid
after the bounded retry`; and `tests/evidence-reasoning.test.mjs` — `fails
explicitly when the model fabricates assessment evidence references`.
`tests/evidence-reasoning.test.mjs` — `does not call the model or retrieval
when the test has no recorded outcome` also passed for that one accepted-test/
no-outcome case. These tests prove only their schema, reference, and
call-suppression assertions; they do not prove semantic support for every
generated claim, live database ownership, or all missing-evidence cases.

**Assessment: PARTIAL.** These checks demonstrate reference/schema validation
within their mocked paths; they do not prove that every natural-language claim
is semantically supported by its cited record or that authorization and
persistence work against a live database. Conflicting-evidence handling is
**NOT TESTED** by the focused run; a similarly named test exists outside its
include list but was not executed.

## 9. Failure handling, retries, timeouts, and recovery

The relevant executed mocked tests are:

- `tests/suggest-test-graph.test.mjs` — `propagates a model outage and does not save a fallback proposal`: rejects on a mocked model error and asserts no proposal persistence.
- `tests/suggest-test-graph.test.mjs` — `retries once when a generated citation is not among retrieved sources` and `never persists when output remains invalid after the bounded retry`: one validation retry, then no persistence for still-invalid output.
- `tests/education-retrieval.test.mjs` — `falls back to safe direct content when a stale cache refresh fails`: mocked optional refresh failure with direct retrieval fallback.
- `tests/models.test.mjs` — `allows 75 seconds for a completion request`: asserts a 75-second abort signal is supplied to mocked fetch; it does not wait for or cause a real timeout.
- `tests/models.test.mjs` — `logs the underlying network error and cause without logging credentials`: asserts mocked network-error reporting and credential redaction.

These do not test a live network timeout followed by successful retry,
duplicate-side-effect behaviour after an uncertain response, or MCP transport
recovery.

These demonstrate the named mock paths only. The workflow does not retry a GLM
outage into a fabricated fallback.

**Assessment: PARTIAL.** No failed test was observed in the focused suite. The
Fetch/PostgreSQL integration was skipped, not passed.

## 10. Human-in-the-loop controls and safety

Suggest Test persists a `SUGGESTED` proposal; the graph does not expose the
acceptance tool. The scheduled orchestrator filters its tool set and does not
offer `accept_suggested_test`. These are source-level boundaries, not
runtime-tested approval guarantees.

There is no production authenticated teacher identity in the public MCP path:
its shared bearer resolves to the demo teacher. The legacy
`POST /api/mcp/approve-note` route returns HTTP 501 and does not implement an
approval workflow. The public `accept_suggested_test` MCP tool is a separate
state-changing capability and is not guarded by a verified, individually
authenticated human principal.

Approval bypass and agent self-approval are **UNVERIFIED**. No test attempted
those actions. Do not claim that a model-generated action is equivalent to an
authenticated teacher decision.

## 11. Backend execution logs, audit reconstruction, and cost per run

The logger attempts to write run, model, tool, and retrieval/cache events to
`agent_activity_logs` when PostgreSQL is available. The exact cost tests and
their boundaries are listed in scenario 13. They calculate a unit-test amount
from supplied token counts and configured rates; they do not establish an
actual per-run bill.

**Assessment: PARTIAL for cost calculation; NOT TESTED for persisted run
reconstruction.** To verify reconstruction, retain a synthetic run ID and
show a database-backed query that joins its start, model, tool, and finish/error
events in order, including proof of what happens when a log insert fails. To
verify actual per-run model cost, capture real provider-reported token usage
for that run, persist the associated model and pricing version, and reconcile
the calculated model charge with provider billing. Report hosting, database,
and network costs separately; token pricing alone is not total system cost.

## 12. Results and limitations

| Evaluation area | Assessment | Evidence boundary |
|---|---|---|
| Focused mocked/unit suite | `PASS` | 52 passed, 1 opt-in test skipped; command and date recorded above |
| TypeScript type-check | `PASS` | `npm exec tsc -- --noEmit`, exit 0 |
| Dira MCP registration | `PARTIAL` | `tests/suggest-test-graph.test.mjs` — `registers exactly thirteen public Dira MCP tools` passed over in-memory SDK transport; no independent HTTP invocation |
| Independent Dira HTTP MCP client | `NOT TESTED` | No separate client discovery/invocation evidence; required evidence is specified in Section 6 |
| Keeper borrowed MCP | `FAIL` (path absent) / live call `NOT TESTED` | Repository search found no application call site; no live Keeper failure was observed |
| State-dependent scheduled tool use | `NOT TESTED` | Source has bounded allowlists/limits; no orchestrator behavioural test executed |
| Evidence-reference validation | `PARTIAL` | Exact mocked test names and limits are in scenario 7; semantic entailment and live ownership are not proven |
| Open-weight model task | `UNVERIFIED` | Architecture and requirements disagree; no qualifying model execution/log evidence or confirmed criterion |
| Live education retrieval / Fetch MCP | `UNVERIFIED` | No live source or Fetch request made; Fetch integration case skipped |
| Human approval / caller identity | `UNVERIFIED` | Demo bearer context only; approval route is not implemented |
| Persisted audit reconstruction | `NOT TESTED` | No populated database run was inspected; required evidence is specified in Section 11 |
| Actual per-run cost | `NOT TESTED` | Cost formula and usage parsing tests are mocked; no actual run/bill reconciliation |

The repository's previous EVALS text recorded a live Dira MCP retrieval run
with failures from four education sources. That report did not include a
retained raw command log in the repository, and the run was not repeated for
this audit. Treat those individual source errors as **UNVERIFIED historical
reports**, not as failures reproduced here. No test failure was reproduced
during this audit.

## 13. Known unresolved limitation and next step

**Unresolved limitation (confirmed by repository inspection):** Keeper's
read-only adapter has no application call site. The external borrowed-MCP
connection-and-invocation criterion is therefore not met by the current
implementation. No live Keeper attempt was made, so there is no observed
provider failure to report.

**Next verification step:** after a separately approved implementation task,
configure a non-sensitive test calendar through the supported OAuth flow,
discover Keeper tools through the official MCP client, select a discovered
read-only event tool, and invoke it with a bounded range of no more than 24
hours. Retain a sanitized result and test evidence without calendar contents or
credentials.

**Resolution evidence:** a repeatable integration test shows authenticated
MCP discovery and a successful read-only invocation with the expected bounded
result shape; missing credentials, unavailable tools, invalid schemas, and
provider errors fail explicitly. No implementation attempt or live Keeper
verification was made during this documentation audit.
