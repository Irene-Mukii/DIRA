
Why is it implementing changes already to the .md files like the README? Did we not focus? Wasn't those documentation supposed to happen after we have actually generated the plan implementation plan? The implementation plans have been done and then now we move on. Because right now it's patching things to do with architecture and README. So what did we do wrong in our prompt? Those that there are conflicts, uta-delete zote.

Thought for 5s
Irene, you are right. We did not intend for Copilot to start modifying README, architecture documentation, or other files before we reviewed final_implementation.md. We explicitly instructed it to work in planning-only mode.

The problem is that our prompts described two different stages of work, and although we stated the restriction, we didn't sufficiently reinforce the boundary when we added the subsequent documentation requirements.

Let me explain what went wrong and how to stop it.

1. What we got wrong in the prompts
Our original instruction was explicit:

Create or update only final_implementation.md.

It also said:

Do not edit application code, tests, database schema, migrations, environment files, package files, existing documentation, or UI.

And:

Wait for my review and explicit approval before coding.

That instruction was correct.

The confusion arose when we subsequently added a documentation phase. We introduced instructions to update:

EVALS.md
README and developer guides
MCP documentation
Fetch MCP documentation
Scheduler and deployment documentation
Those instructions were intended to describe what Copilot should plan to do later. However, they were written as direct implementation instructions rather than being explicitly restricted to the planning document.

For example, the instruction:

Update the appropriate existing README, developer guide, environment-variable example, or deployment documentation as needed.

could be interpreted by Copilot as permission to edit those files immediately.

We should have made it unmistakably clear that all documentation changes, including EVALS.md, must wait until implementation and evaluation are complete.

There is a second issue: Copilot can also follow earlier instructions from the same conversation or task. Adding a new prompt does not necessarily cancel actions it has already started.

So we had the correct intention, but the later instructions weakened the boundary.

2. What we need to do right now
Step 1: Stop Copilot's current task
If it is still running, stop it using the Stop button in VS Code.

Do not let it continue modifying files while we investigate.

Step 2: Inspect the changes before reverting anything
In your Git Bash terminal, run:

git status --short
This shows the files Git considers modified, added, or deleted.

Then run:

git diff --stat
This summarizes the tracked changes.

To inspect the actual modifications, run:

git diff
Do not run git checkout ., git reset --hard, or a blanket revert. You may have legitimate work in progress, and those commands could destroy it.

If Copilot has created new untracked files, git diff alone will not show their contents. The git status --short output will help us identify them.

Share the output with me, and we can distinguish the unintended changes from work you want to keep.

Step 3: Do not delete everything blindly
You said that conflicting changes should be deleted. I agree that unintended changes should be removed, but we need to identify exactly which changes belong to this task first.

Our objective is to restore the repository to its state before Copilot began making unauthorized edits, without losing your existing work or the implementation plan.

3. The corrected instruction for Copilot
Once we have addressed the current changes, give Copilot this instruction before allowing it to continue.

STRICT TASK BOUNDARY — PLANNING ONLY
STOP ALL IMPLEMENTATION AND DOCUMENTATION EDITS IMMEDIATELY.

The current task is to prepare a plan for human review. You are NOT
authorized to implement the planned changes.

The ONLY file you may create or modify during this task is:

final_implementation.md

Do not create, edit, delete, rename, or reformat any other file.

This restriction includes, but is not limited to:

- README.md and other README files
- EVALS.md
- Architecture documentation
- MCP documentation
- Environment-variable examples
- Deployment documentation
- Application source code
- Tests
- Database schemas and migrations
- Package files and configuration
- UI components and styles

You may READ these files to understand the existing system.

You may DOCUMENT proposed future changes to these files inside
final_implementation.md.

You may NOT APPLY those proposed changes to the files themselves.

DOCUMENTATION PHASE RULE:

The implementation plan must contain a dedicated future documentation
phase.

That phase must specify that EVALS.md and other relevant documentation
will be updated AFTER implementation and the corresponding tests have
actually been executed.

The plan must distinguish:

1. Documentation planning performed now.
2. Documentation changes performed during the future implementation.
3. Evaluation results recorded only after tests have run.

Do not update EVALS.md now.
Do not update README files now.
Do not update architecture documentation now.

FETCH MCP RULE:

The plan must explain why Fetch MCP is being considered, based on the
observed education-retrieval failures.

It must plan for Fetch MCP to be integrated behind the existing
education-retrieval-focused tool, without unnecessarily changing the
existing workflow or public contract.

It must include a 14-day PostgreSQL Markdown cache and require
verification that PostgreSQL row storage is suitable for the expected
content sizes.

These are planning requirements only. Do not implement them now.

PRESERVATION RULE:

Preserve all existing working functionality.

Do not refactor, redesign, repair, optimize, or modify unrelated parts
of the application during this task.

Do not resolve architectural questions by changing code.

If a proposed change could affect working functionality, document the
risk and mitigation in final_implementation.md.

COMPLETION RULE:

1. Finish final_implementation.md.
2. Verify that it covers all requested implementation phases,
   dependencies, tests, evaluation scenarios, documentation, and
   acceptance criteria.
3. Check git status and confirm that no other files were changed by
   this task.
4. Do not attempt to undo unrelated pre-existing changes.
5. Stop and wait for explicit human approval.

Do not start implementation under any circumstances during this task.
4. The workflow we should have followed
To avoid repeating this problem, DIRA's remaining work should follow four distinct stages.

Stage	What Copilot is allowed to do	What it must not do
1. Planning	Inspect the repository and write final_implementation.md	Modify application files or other documentation
2. Plan review	Make requested changes to final_implementation.md only	Start implementation
3. Implementation	Implement approved phases, run tests, and fix relevant failures	Make unrelated changes or rewrite working systems unnecessarily
4. Documentation and acceptance	Update EVALS.md, README, MCP documentation, and other relevant documents using verified implementation and test results	Claim untested functionality works
The Fetch MCP rationale belongs in the plan now. The final explanation of its demonstrated benefits belongs in the documentation phase, after the implementation has been tested.

Likewise, EVALS.md should describe the planned evaluations now inside final_implementation.md, but its actual results should be recorded after the tests run.

My recommendation
Let's first inspect what Copilot has already changed before giving it another implementation prompt.

Send me the output of:

git status --short

We will identify exactly what was modified, preserve your existing work, and remove only the unintended changes. Then we can make sure the planning stage is genuinely complete before authorizing any implementation.

I just want to revert that git. I don't need to do all this status short and difference. I already know what was like everything that was before, and I know I don't want those changes. So how do I just have a revert?
If you want to discard all local changes and restore tracked files to the last Git commit, run this in your Git Bash terminal:

git reset --hard HEAD

To also delete untracked files and folders that Copilot created, run:

git clean -fd

Important: These commands permanently discard uncommitted changes to tracked files and delete untracked files. This includes any legitimate work or new files you wanted to keep.

If you're certain you want to revert everything, run both commands in that order. Your repository will return to the state of the last commit, removing the changes Copilot made since then.


Pasted markdown.md
Document
this is the document it created

look for any holes in the implementation plan
I’ve reviewed final_implementation.md. Overall, this is a thoughtful plan: it explicitly protects existing functionality, requires evidence before adopting Fetch MCP, keeps the 14-day cache behind the existing education retrieval tool, and separates planning from implementation and documentation.

However, I would not approve it for implementation yet. There are several gaps and a few important sequencing conflicts that could lead Copilot to build a technically thorough solution that still misses your immediate goals.

Here are the issues I would resolve first. 
Pasted markdown.md

1. The biggest holes to address
1. The plan could spend too long qualifying Fetch MCP before delivering the required integration

High priority
Phases 0–1 require a baseline, human decisions, provider qualification, and a comparison against the existing retriever before implementation can proceed. That is defensible engineering, but the plan doesn't define a lightweight, time-boxed qualification that respects your hackathon deadline.

Fix: Limit qualification to a small, representative test set and a defined time budget. Produce a decision: integrate Fetch MCP, or document the blocker and ask you. Do not allow an open-ended research phase to consume the implementation window.

Also, the plan must distinguish between testing Fetch MCP directly and integrating it into DIRA. Passing the first does not prove the second works.

2. The scheduled agent is not clearly separated from logging and frontend work

High priority
Phase 5 combines scheduler integration, execution tracing, and frontend logs. That creates a risk that Copilot builds a log viewer without first proving that scheduled work is actually being triggered, or modifies the scheduler while changing the logging schema.

Fix: Make scheduled-agent integration and automatic execution a distinct phase, with its own acceptance gate. Require a real scheduled trigger in a controlled environment, runtime tool selection, tool-result consumption, duplicate-trigger protection, and a persisted run ID. Only then proceed to the full activity-log UI.

The scheduler should be selected based on the actual deployment environment. A protected API endpoint alone does not constitute a running scheduler.

3. The cache plan doesn't fully resolve what happens when multiple pages are fetched for one source

High priority
The plan proposes a cache identity based on source and canonical URL, which is sensible. But the existing retriever discovers pages through sitemaps and may consider several candidate pages per source. It doesn't explicitly specify whether sitemap discovery itself is cached, whether only page Markdown is cached, or how changed sitemap contents affect discovery.

Fix: Define separate cache policies for discovered candidate URLs and fetched page content if both are to be cached. If sitemap caching is out of scope, say so explicitly. Ensure that a fresh page cache doesn't prevent DIRA from considering relevant newer pages when the candidate list changes.

Otherwise, the cache could make individual fetches faster while leaving the discovery bottleneck intact.

4. The external MCP identity phase is too large and has no explicit minimum viable scope

High priority
Phase 4 proposes replacing demo authentication with a reviewed identity mechanism, revocation, tenant authorization, role checks, and audit attribution. These are important, but they can turn MCP discoverability into a much larger authentication project.

Fix: Define two distinct acceptance levels:

Minimum external-client demonstration: an independent client can discover tools and invoke a permitted, non-mutating tool using documented prerequisites and synthetic data.

Production readiness: verified caller identity, tenant isolation, role-based authorization, credential lifecycle, and audited mutations.

The plan must not present the first as proof of the second. It should identify which level the challenge requires and avoid silently expanding the deliverable.

5. The evaluation phase has an ordering problem

High priority
Phase 7 says the tests should be run and failures triaged, while Phase 8 says the final evaluation records should be completed after relevant tests run. That is broadly sensible, but the plan doesn't explicitly require a baseline regression run before implementation or a verification run after each phase.

Fix: Add three checkpoints:

Baseline tests before any code changes.

Relevant tests immediately after each implementation phase.

A final regression and evaluation run after all phases.

Keep EVALS.md updates in the documentation phase, but preserve test evidence during implementation so actual results aren't lost. The final documentation phase should consolidate that evidence, not reconstruct it from memory.

2. More gaps that could affect implementation
6. The documentation instructions still contradict each other
This is particularly important given the earlier issue with Copilot modifying README files too soon.

In Phase 7, the plan says:

EVALS records the actual evidence and blockers.

But Phase 8 says the documentation phase happens after implementation and tests, and that the evaluation results should be recorded after execution. 
Pasted markdown.md

Those instructions are close, but they leave room for Copilot to start editing EVALS.md during Phase 7.

Required correction: During implementation and testing, preserve results in test output, run records, or a dedicated implementation report if needed. Do not edit EVALS.md, README, or architecture documentation until Phase 8. Phase 8 consolidates the evidence into the documentation.

The plan should also explicitly prohibit Copilot from modifying any documentation outside final_implementation.md before implementation is approved.

7. The model-cost phase does not fully define how usage gets connected to a run
Phase 6 correctly identifies token usage, pricing, retries, and unknown costs. But it depends on the event infrastructure from Phase 5. 
Pasted markdown.md

There is a potential implementation trap: the provider may return usage metadata, but that data can be lost between the model adapter, LangGraph nodes, retries, and the final run record.

Required correction: Specify an end-to-end test that verifies the complete chain:

A model call returns actual usage metadata.

The adapter preserves that metadata.

The call is associated with the correct run ID.

Each retry or correction call is recorded separately.

Per-call cost is calculated using the applicable pricing configuration.

The run total matches the sum of its billable calls.

The API and frontend show the same persisted result.

The test should also verify that a failed run with billable model usage does not incorrectly report zero cost.

8. Fetch MCP could increase the 58-second latency if integrated incorrectly
The plan proposes timeouts and bounded extraction, which is good. But it does not define an explicit total time budget for the entire Suggest Test request.

The observed request took around 58 seconds, according to the logs you shared. If Fetch MCP is called sequentially for multiple candidate pages, adding a network hop could make that worse.

Required correction:

Measure the existing end-to-end latency before implementation.

Set a total retrieval budget in addition to per-request timeouts.

Define what happens when that budget is exhausted.

Verify whether source retrieval can be bounded or parallelized safely without changing ranking or evidence semantics.

Measure both cache-hit and cache-miss latency.

Ensure the workflow does not wait for unnecessary sources once its approved retrieval budget is exhausted.

The objective should not merely be to retrieve Markdown successfully. It should be to improve retrieval reliability without making the user wait even longer.

9. The cache and logging phases have a dependency gap
The cache is introduced in Phase 3, but comprehensive logging is introduced in Phase 5.

That is acceptable if Phase 3 creates the logging interface or emits events that Phase 5 later persists. The plan does not currently make that relationship explicit.

Required correction: Define a minimal logging contract before implementing the cache. Phase 3 should use the agreed event interface for cache hits, misses, refresh attempts, failures, and persistence outcomes. Phase 5 can then connect or extend that interface to the correlated persistent run log.

This prevents Copilot from building temporary console logging in Phase 3 and then rewriting it in Phase 5.

10. There is no explicit rollback strategy for switching retrieval implementations
The plan discusses feature flags and controlled fallback, but it does not require a concrete rollback procedure.

Required correction: Before switching the default retrieval implementation, establish how to return to the existing retriever if Fetch MCP causes regressions. This should include:

A configuration or feature-flag mechanism, if compatible with the existing application.

A way to disable Fetch MCP without deleting cached content.

A clear distinction between fallback to the existing retriever and use of stale cached content.

A regression test showing that the original retrieval path still works.

A documented rollback procedure for the database migration.

Do not introduce a feature-flag framework if the repository has no need for one. Use the smallest existing-compatible mechanism.

3. The plan may be too ambitious for the remaining time
The document has 17 evaluation scenarios, a new external retrieval dependency, PostgreSQL storage, a scheduler, a possible authentication redesign, event logging, pricing, frontend changes, and documentation.

That is a substantial scope. The plan has good safeguards, but it does not sufficiently distinguish required for the challenge demonstration from required for production readiness.

I would add this prioritization:

Priority

Required outcome

P0 — Preserve

Existing working tests and workflows remain functional; no unauthorized UI or architecture changes.

P1 — Core delivery

Scheduled agent genuinely executes; runtime tool selection is verified; run/action records persist; Fetch MCP is integrated only after qualification; the Markdown cache behaves correctly.

P1 — Evidence

Required evaluation scenarios are executed and outcomes recorded truthfully.

P1 — Visibility

Actual agent activity reaches the frontend, with accurate statuses and available model usage/cost.

P2 — External MCP

Independent discovery, documented prerequisites, and a safe invocation are demonstrated. Production identity requirements are explicitly resolved rather than assumed complete.

P2 — Handover

Final documentation and deployment instructions reflect verified behaviour.

This prioritization is a proposal, not permission to skip any mandatory judging criterion. The team should confirm which external MCP identity requirements are actually required for the challenge.

4. Two specific details in the document need correction
First: the EVALS.md baseline may now be stale.

The plan says EVALS.md was modified in the working tree and must be preserved. 
Pasted markdown.md

You subsequently ran git reset --hard HEAD. If that reset removed the previous uncommitted changes, this statement may no longer be true. The plan should say to inspect the current state when the approved implementation begins, without assuming that the earlier modification still exists.

Second: the scheduler's automatic execution needs a more concrete demonstration.

The plan correctly states that the repository does not select or configure a hosting scheduler. 
Pasted markdown.md

But the acceptance criteria should require evidence of an actual due job being picked up automatically in the intended environment. Manually calling the protected API endpoint, even if the agent runs correctly, is not proof that the scheduler works.

5. What I would require before approving this plan
Plan review checklist
0 of 10 reviewed


Separate scheduled-agent implementation and acceptance testing from frontend log integration.

Add baseline, per-phase, and final regression checkpoints.

Move all EVALS.md and other documentation edits strictly into Phase 8.

Define the cache scope for discovered URLs versus fetched Markdown pages.

Set an end-to-end retrieval time budget and test cache-hit/cache-miss latency.

Define the logging contract before cache and agent instrumentation are implemented.

Add a concrete rollback path for Fetch MCP and its database migration.

Prioritize challenge-critical delivery separately from production hardening.

Correct the potentially stale statement about the EVALS.md working-tree modification.

Require automatic scheduler execution, not merely manual endpoint invocation, as acceptance evidence.
My overall assessment
The plan is stronger than a typical implementation prompt because it identifies security boundaries, avoids claiming Fetch MCP will bypass blocked sites, requires a realistic PostgreSQL storage test, and insists on evidence rather than assuming tests pass.

Its biggest weakness is execution control: too many responsibilities are bundled together, the documentation boundary is not perfectly consistent, and several acceptance criteria could be satisfied superficially without proving the actual end-to-end behaviour.

I would correct those issues before authorizing implementation. The objective is not to make the plan longer; it is to make every phase independently verifiable, keep the scope under control, and ensure Copilot cannot accidentally break what already works.

Revise the DIRA final_implementation.md planning document to address these implementation-plan gaps, without implementing any code or editing any other file:
1. Separate scheduled-agent implementation and acceptance testing from frontend log integration.
2. Add baseline, per-phase, and final regression checkpoints.
3. Move all EVALS.md and other documentation edits strictly into Phase 8.
4. Define the cache scope for discovered URLs versus fetched Markdown pages.
5. Set an end-to-end retrieval time budget and test cache-hit/cache-miss latency.
6. Define the logging contract before cache and agent instrumentation are implemented.
7. Add a concrete rollback path for Fetch MCP and its database migration.
8. Prioritize challenge-critical delivery separately from production hardening.
9. Correct the potentially stale statement about the EVALS.md working-tree modification.
10. Require automatic scheduler execution, not merely manual endpoint invocation, as acceptance evidence.
Preserve existing working functionality, maintain a strict planning-only boundary, and wait for human approval before implementation.
…

Worked for 1m 24s
I’ve revised the plan to address all 10 gaps and saved the updated document.

Download the revised final_implementation.md

The key changes are:

Separate phases: scheduled-agent execution, persistent logging, frontend log integration, model-cost reporting, evaluations, and documentation now have distinct acceptance gates.

Regression checkpoints: baseline tests before implementation, targeted tests after each phase, and a final regression run.

Documentation protection: EVALS.md, README, architecture documentation, and other files must not be edited until Phase 10.

Cache design: discovered URLs and fetched Markdown have distinct responsibilities and caching policies.

Performance targets: provisional targets of 15 seconds for retrieval on a cache miss, 5 seconds on a cache hit, and 30 seconds for the full Suggest Test request, subject to baseline verification and approval.

Logging contract: defined before cache, scheduler, agent, and model instrumentation.

Rollback: explicit requirements for disabling Fetch MCP and returning to the existing retriever without unnecessarily deleting cached data.

Prioritization: challenge-critical delivery is distinguished from production hardening.

Scheduler proof: a manual API call is explicitly insufficient; automatic scheduled execution must be demonstrated.

Worktree safety: the plan no longer assumes the earlier EVALS.md modification still exists after your Git reset.

At that planning checkpoint, no application code or other documentation had
been intentionally changed. The user subsequently approved implementation;
work and post-test documentation updates are recorded below and in `EVALS.md`.


final_implementation.md
Document
# DIRA Final Implementation Plan

**Status:** Approved for implementation by the user's later instruction to
"go ahead and implement." Implementation and post-test documentation updates
have been made. Actual test outcomes and outstanding gaps are recorded in
`EVALS.md`; this status does not imply every acceptance criterion passed.

**Approval gate:** Satisfied for the planned scope. Production scheduler
configuration, authenticated MCP caller identity, administrator log access,
and the real Fetch MCP/PostgreSQL round trip remain unresolved or unverified as
documented in `EVALS.md`.

## 1. Purpose and boundaries

This plan describes the approved, evidence-led implementation and handover for DIRA.

It covers retrieval reliability, Fetch MCP qualification and integration, a

14-day PostgreSQL Markdown cache, independent MCP use and identity, scheduled

execution and observability, model usage/cost, tests, and final documentation.

The plan was written before implementation and reviewed before work began.
Implementation-specific documentation was finalized only after the relevant
tests and verification attempts; planned evaluations that remain blocked or
untested are explicitly marked in `EVALS.md`.

Preservation requirements for the future work:

- Preserve the current observation, suggestion, evidence lifecycle, source

  selection/ranking, and scheduled follow-up behavior except where a reviewed

  acceptance criterion explicitly requires a behavior change.

- Do not introduce a second education-retrieval pipeline or change the public

  `retrieve_education_resources` contract unnecessarily.

- Do not send database credentials supplied by an MCP caller to DIRA. A caller's

  identity and authorization are distinct from the database DIRA uses.

- Keep external content, learner evidence, and model output distinguishable.

- Do not claim Fetch MCP, an approval gate, cost measurement, or audit

  reconstruction is working until the corresponding behavior has been tested.

- Do not repair unrelated existing issues or rewrite architecture as part of

  this work.

## 2. Repository baseline and evidence

The following facts were established by source inspection. They are a baseline,

not a claim that production or third-party services have been exercised.

| Area | Current evidence | Baseline limitation |

|---|---|---|

| Education retrieval | `lib/services/education-retrieval.ts` discovers pages through official-domain sitemap/robots locations, fetches bounded content, extracts plain text, ranks up to three candidate pages per source, and returns per-source result/error metadata. Current limits include a 256,000-byte sitemap, 128,000-byte page, 3 pages per source, and a 3.5-second request timeout used within a 7-second source timeout. | The implementation performs direct HTTP requests and HTML/text extraction; it does not invoke Fetch MCP and does not persist page Markdown. |

| Existing retrieval tests | `tests/education-retrieval.test.mjs` covers exact source URLs/excerpts, rejecting sitemap URLs outside the configured domain, and continuing after an access restriction. | These are mocked HTTP tests; they do not prove live site access, Fetch MCP behavior, real-world latency, or caching. |

| Suggest Test | `lib/mcp-tools/suggestionWorkflowTools.ts` registers `retrieve_education_resources`; the LangGraph calls the service through an in-process MCP transport. | The public tool contract currently returns retrieval status and excerpts, not a persisted Markdown cache. |

| MCP client/server | `app/api/mcp/server/route.ts` exposes the Dira Streamable HTTP MCP server behind a shared bearer token. Tool handlers use a deterministic server-selected demo teacher. | This does not authenticate an individual external MCP caller as a specific teacher. Runtime HTTP use by an independent client is not established by the in-process inventory test. |

| Independent caller and database | Current learner-facing tools retrieve from or write to DIRA's PostgreSQL database using server-resolved context. `suggest_test` accepts learner/submission IDs; it does not accept the caller's own database connection or a self-contained evidence set. | A caller's credentials or identity alone do not connect their database. A BYO-database adapter or data-import contract would be separate scope and requires explicit approval. |

| External calendar MCP | `lib/external-mcp/calendar.ts` contains Keeper helpers and `.env.example` lists `KEEPER_MCP_URL`. | No production connection, user OAuth/token lifecycle, or authenticated invocation was established. Keeper is separate from the proposed Fetch MCP integration. |

| Scheduled agent | `app/api/internal/follow-up-agent/route.ts` is protected by `FOLLOW_UP_SCHEDULER_SECRET`; `lib/agent/orchestrator.ts` connects to Dira MCP and bounds model turns/tool calls. | The repository does not select/configure a hosting scheduler. Scheduled-agent runs do not currently have a complete persisted run/event record. |

| Logging and cost | `db/002_agent_activity_logs.sql` and `lib/agent/logger.ts` support operation/tool-like log rows. Some evidence reasoning calls persist logs. | The active Suggest Test graph logs stages to the console; the scheduled agent returns a summary rather than persisting a complete event trace. The model adapter discards usage metadata; per-run cost is not calculated. |

| Markdown cache/schema | No Fetch MCP cache table, migration, or 14-day freshness implementation was found in the inspected code. Existing database documentation says a persistent education-source catalogue/cache was not previously in scope. | Storage size, retention, cache key, migration, and stale-content policy must be designed and tested before being described as implemented. |

| Evaluation documentation | `EVALS.md` was a two-line heading/body stub in the inspected snapshot. A prior status report indicated it was modified at that time, but subsequent Git reset/revert actions may have changed the current worktree state. | Re-check the actual worktree and repository history at implementation start; do not assume the earlier modification still exists or overwrite any currently present work without review. |

| Reported retrieval issue | The request describes a `/api/mcp/suggest-test` response around 58 seconds with some source failures (403/404, oversized content, timeouts, extraction failures). | These are user-supplied observations, not independently verified by this plan. Obtain sanitized request/source logs and an exact baseline run before claiming a measured cause or improvement. |

Existing commands relevant to future validation:

- `npm run test:suggest-test` runs the isolated Vitest suite configured by

  `vitest.unit.config.mjs`.

- `npm run test:follow-ups` runs the broader Vitest setup. Its global setup

  requires `DIRA_TEST_DATABASE_URL` to point to the loopback development

  PostgreSQL database `dira_dev` on port `5433`; tests can create temporary

  schedule records. Use only after checking the test database and fixtures.

- `npm run mcp:test` is **not** a safe read-only discovery check: the current

  script saves an observation linked to an accepted activity test and changes

  that test's lifecycle. Do not use it as an independent-client verification

  until a safe, non-mutating test path exists and is reviewed.

- The audit run before this plan reported 5 isolated test files / 19 passing

  tests via `npm run test:suggest-test`, and 18 passing deterministic tests via

  `node --import tsx --test lib/mcp-tools/suggestTest.test.ts`. Those results

  are limited to mocked/pure tests; they do not prove live providers, PostgreSQL

  persistence, the public MCP HTTP route, Fetch MCP, or scheduler deployment.

## 3. Objectives and non-goals

### Objectives

1. Establish a reproducible, sanitized baseline for education retrieval

   correctness and latency.

2. Qualify a specific Fetch MCP server and its real tool contract before

   integrating it.

3. If qualification demonstrates a useful advantage and security safeguards

   pass review, invoke Fetch MCP behind the existing education retrieval

   service/tool.

4. Cache validated Markdown in PostgreSQL for 14 days after the last successful

   retrieval; failed refreshes must not renew freshness or corrupt a valid

   entry.

5. Verify that PostgreSQL storage and query patterns are appropriate for

   measured Markdown sizes and the expected cache access pattern.

6. Provide authenticated, independently usable MCP access with server-side

   tenant/teacher authorization; document that external callers use DIRA's

   authorized data unless a separate data-source integration is approved.

7. Make scheduled triggering, duplicate protection, run/action traceability,

   frontend log visibility/authorization, and model-usage/cost limitations

   reproducible.

8. Execute and truthfully record the ten required scenarios and the additional

   implementation-specific evaluations.

9. Update documentation only after relevant implementation and tests have

   run; report unresolved items as blocked, unverified, or not tested.

### Non-goals unless separately approved

- Replacing the existing source selection/ranking or evidence preparation with

  an unrelated retrieval pipeline.

- Treating Fetch MCP as a means to bypass 401/403 access controls, paywalls,

  robots restrictions, source terms, or source-domain validation.

- Accepting arbitrary caller-provided URLs or database credentials.

- Automatically switching existing users to a new cache or external service

  without a controlled rollout/rollback path.

- Claiming a live external MCP works because its URL is configured or because

  MCP tool discovery works in an in-memory test.

- Claiming exact cost if provider usage metadata, applicable rates, or other

  metered service usage is unavailable.

- Implementing unrelated UI, pathway, guardian-sharing, or identity features

  beyond those explicitly approved as prerequisites for the stated acceptance

  criteria.

## 3A. Delivery priorities and scope control

Use these priorities to protect the challenge-critical demonstration without
silently dropping security or evaluation requirements:

P0 — Preservation and safety: baseline existing behavior; no unrelated UI,
architecture, or documentation edits; maintain evidence and approval safeguards.
P1 — Challenge-critical proof: demonstrate actual scheduled-agent execution
and bounded runtime tool selection; persist correlated run/action events; qualify
and integrate Fetch MCP only if it passes the approved test; prove the 14-day
cache; show actual persisted logs in the existing frontend; run required scenario
evaluations and regression tests.
P1 — Cost transparency: capture provider usage and calculate cost where usage
and verified rates exist; label unknown values honestly.
P2 — Production hardening and handover: complete production-grade identity,
credential lifecycle, deployment monitoring/alerts, retention operations, and
comprehensive setup documentation to the extent approved and feasible.
These labels prioritize sequencing, not permission to weaken data safety. If the
challenge requires a production-grade identity control, it becomes P1. Copilot
must identify which P2 items are out of the challenge's acceptance scope and obtain
human approval before deferring them. A demo-only identity must never be described
as production-ready.

## 4. Human decisions required before implementation

Record the decision and approver for each item before the dependent phase

starts. If a decision is not made, keep that phase blocked rather than choosing

silently.

1. **Fetch MCP provider and entry point:** identify the specific server,

   deployment, supported transport, authentication, tool name/schema, data

   handling terms, availability expectations, and any usage cost. Verify from

   authoritative server documentation and a controlled test endpoint.

2. **Fetch selection/eligibility boundary:** confirm that the current

   official-domain source and URL eligibility rules remain authoritative and

   that the Fetch server can retrieve only URLs selected and validated by DIRA.

3. **Fetch adoption gate:** approve the representative test set and minimum

   improvement required (correctness, readable Markdown, latency, or

   maintainability) to justify adding the dependency. Do not assert Fetch MCP is

   better before the baseline comparison.

4. **Stale cache behavior:** proposed first-version policy is **no stale-content

   fallback**. If refresh fails after an entry expires, retain the stored row

   for diagnostic/retry purposes but return an explicit failure/no-result for

   that source; do not pass expired Markdown to suggestion generation and do

   not update its freshness. A different fallback requires explicit approval.

5. **Maximum Markdown size and retention:** measure realistic content sizes,

   define an enforced maximum, and decide deletion/retention rules for public

   content while respecting source terms and licensing. Do not set an

   unsupported size limit from assumption alone.

6. **MCP caller identity model:** choose the supported identity mechanism

   (e.g., per-user OAuth or a server-issued credential mapped to a verified

   DIRA account) and define revocation, role checks, tenant scope, and audit

   actor identifiers. A single shared bearer token plus oldest-teacher resolver

   is demo-only, not the approved production identity solution.

7. **Data source for an external MCP caller:** default proposal is that an

   authenticated caller accesses records hosted by DIRA and authorized to that

   caller. A caller's own database is not automatically consulted. Decide

   separately whether a self-hosted DIRA deployment, validated import, or

   explicit database adapter is in scope; never accept raw DB credentials from

   the client.

8. **Scheduler provider and lifecycle:** identify the deployment scheduler,

   timezone, trigger schedule, retry policy, overlap behavior, and how to

   disable/pause jobs. The repository currently exposes protected trigger

   routes but does not configure a hosting scheduler.

9. **Provider usage and rates:** establish whether the configured model provider

   returns input/output/cached usage, the authoritative rate source and

   effective date, and treatment of failed/retried calls. Decide what to report

   when usage or rate information is absent.

10. **Data/log retention and access:** approve safe logging fields, PII

    redaction/reference strategy, database retention, frontend roles, and

    operator access before adding correlated event records.

## 5. Proposed implementation phases

Phases are ordered by dependency. Every phase has a stop gate; a failed or

unverified gate must be reported rather than bypassed. The phase descriptions

below are plans only and do not authorize edits in this task.

### Phase 0 — Baseline, decisions, and safety review

**Purpose:** establish the actual failure profile and lock scope before

selecting an external retrieval service or changing runtime behavior.

**Planned work:**

- Capture a sanitized baseline of representative existing retrieval runs:

  candidate source URL/domain, stage, HTTP/error category, duration, source

  status, total suggestion request duration, and model/tool stage timings if

  available. Exclude learner names, observation text, credentials, and tokens.

- Ask the team to provide the logs referenced in the task; record that the

  approximately 58-second request and listed failures are reported observations

  until verified from logs.

- Establish a controlled test set of permitted public pages: accessible,

  restricted, missing, oversized, malformed/non-HTML or non-Markdown, and

  timeout cases. Use only safe public URLs and comply with source terms.

- Confirm current contracts, run IDs, log APIs, migration conventions,

  configuration loading, database safety guard, and current tests.

- Obtain the decisions listed in Section 4. Identify an explicit owner for

  production identity and scheduler deployment.

**Dependencies:** human approval to begin implementation; sanitized baseline

artifacts; disposable loopback PostgreSQL test database for DB work; provider

selection and credential handling review.

**Tests/evidence:** record baseline commands/procedures and actual observed

statuses. No live external service call is part of this planning task.

**Exit gate:** baseline and decisions are documented; the Fetch provider is

identified and its contract can be verified. Otherwise Fetch integration stays

blocked and the plan is returned for a decision.

Implementation checkpoint rule for every phase: Before editing, identify the
existing tests and baseline behavior relevant to that phase. After its changes,
run the narrowest relevant tests plus the phase's acceptance tests, then the
appropriate regression subset. Record results as implementation evidence without
editing EVALS.md or any other documentation during Phases 0–9. If a phase fails,
stop, diagnose, and fix or request a decision before moving forward. Never proceed
by relabeling a failed gate as passed.

### Phase 1 — Qualify Fetch MCP and compare alternatives

**Purpose:** test the actual capability before committing DIRA to an external

service. Existing code already performs sitemap discovery, official-domain

validation, bounded HTTP fetching, HTML-to-plain-text extraction, relevance

ranking, and per-source failures. The provisional reason to consider Fetch MCP

is that a separately reusable, standard-protocol retrieval/extraction tool may

return readable Markdown and reduce DIRA's custom page-extraction burden. This

is a hypothesis, not a verified advantage.

**Planned work:**

- Verify the candidate Fetch MCP's actual server entry point, transport,

  authentication, discovery behavior, fetch input/output schema, Markdown

  behavior, error signaling, size/time limits, redirects, URL restrictions,

  licensing/data handling, uptime assumptions, and charges.

- Independently discover the tool and invoke it against the approved controlled

  test set. Capture request/response metadata and sanitized Markdown checksums

  or bounded excerpts; do not retain prohibited content.

- For comparable eligible URLs, compare the current direct fetch baseline and

  Fetch MCP on readable content, source URL fidelity, domain/redirect safety,

  error handling, latency, and operational/maintenance burden.

- Include restricted and missing pages in the comparison. A 401/403 or 404

  remaining a failure is an expected possible result, not an integration bug

  that can be bypassed.

- Decide whether the result demonstrates enough advantage to ship. If not,

  stop the Fetch integration proposal or return to the human for scope review;

  do not claim success solely because the server is external or uses MCP.

**Dependencies:** Phase 0 decisions and authorized test credentials if required.

**Tests/evidence:** reproducible independent MCP discovery/invocation; source

comparison results including failures; provider/tool versions; durations;

security and service-dependency review.

**Exit gate:** verified server capability, acceptable safety boundary, and

evidence-backed advantage over extending the existing retrieval implementation.

### Phase 2 — Integrate Fetch MCP behind existing education retrieval

**Purpose:** preserve the current education retrieval service as the workflow's

owner and keep the registered `retrieve_education_resources` input/output

contract stable wherever possible.

**Planned work:**

- Add a bounded Fetch MCP adapter behind `retrieveEducationEvidence` (or its

  existing source-fetch helper); do not add a parallel source-selection path.

- Keep existing source definitions, official-domain eligibility, sitemap/robots

  discovery or other approved candidate selection, query terms, page ranking,

  relevance evaluation, result statuses, and evidence preparation in DIRA.

- Validate every candidate URL before sending it to Fetch MCP. Validate

  returned/final URL, redirect destination, content type/format, source domain,

  response shape, status, and UTF-8 Markdown size before it can be cited or

  cached.

- Do not permit user/model-supplied arbitrary URLs, localhost/private-network

  targets, credentials in URLs, or unapproved domains.

- Map Fetch MCP errors into the existing per-source error/status vocabulary

  where it remains accurate; define a new error category only if necessary and

  test client compatibility.

- Keep model inputs to bounded relevant excerpts or equivalent selected

  Markdown passages, not unrestricted full documents. Preserve exact page URL,

  source identity, retrieval time, status, and a traceable source reference.

- Define explicit connect/request timeouts and cancellation. A timeout or

  unavailable server must produce an explicit retrieval failure; no success

  shaped fallback and no unbounded retry.

- If rollout needs a feature flag or controlled fallback, obtain approval for

  the behavior and make logs distinguish Fetch MCP from the existing method.

**Potential future files, after approval:** retrieval service/adapter, tests,

server-only config parsing, `.env.example` only if a new configuration variable

is essential, and documentation after verification. No file is authorized for

editing now.

**Dependencies:** Phase 1 exit gate; approved Fetch URL/tool contract and

network/auth configuration.

**Tests/evidence:** mocked protocol and service tests; successful/restricted/

missing/oversized/malformed/timeout cases; redirect/domain rejection; no

external call on cache hits after Phase 3; public MCP contract regression.

**Exit gate:** source eligibility and evidence output remain correct, and every

failure is represented explicitly without bypassing source restrictions.

### Phase 3 — 14-day PostgreSQL Markdown cache

**Purpose:** avoid repeated external retrieval for successfully validated public

pages while content is fresh.

**Proposed cache behavior:**

- Cache only after a successful Fetch MCP retrieval and DIRA validation.

- Cache key should include a stable source key and canonical, validated page URL;

  review whether an extraction/normalization version is needed for safe

  invalidation. Do not key by raw learner query or learner identity.

- Store Markdown as PostgreSQL `TEXT` with source key, canonical URL, title and

  safe content metadata, UTF-8 byte length, content hash, last successful

  retrieval timestamp, and any version/status fields needed to validate it.

- Use a unique constraint on the stable cache identity and parameterized

  queries. The exact schema and indexes must follow repository migration

  conventions and be reviewed before implementation.

- A cache entry is fresh for 14 days after its **last successful validated

  retrieval**. A lookup, failed refresh, failed write, or cache hit must not

  extend that timestamp.

- Cache hit: use cached Markdown only if identity, validation/version and age

  checks pass; record a cache-hit event and do not invoke Fetch MCP.

- Cache miss: invoke Fetch MCP; persist only after all checks pass.

- Stale entry: attempt refresh. On successful refresh, atomically replace

  content/metadata and advance last-success time. On failed refresh, retain the

  previous record unchanged, return explicit failure/no-result under the

  proposed no-stale-fallback policy, and do not expose stale content to

  suggestion generation.

- Concurrency: prevent duplicate cache stampedes where feasible; ensure

  concurrent refreshes cannot overwrite newer valid content with an older

  response.

- Ensure source changes and query relevance do not make a cached page appear

  relevant without rerunning DIRA's relevance/ranking step. The cache stores

  page content, not a final learner recommendation.

- Define a retention/deletion policy for expired public content and operational

  cleanup. Expiry is not deletion; do not silently retain indefinitely without

  an approved policy.

**PostgreSQL Markdown size verification is a prerequisite, not an assumption:**

1. Measure UTF-8 Markdown bytes for representative eligible sources and the

   approved maximum content returned by Fetch MCP.

2. Define a hard application limit based on that measured distribution and

   provider behavior. Reject oversized content explicitly; do not truncate

   source text in a way that invalidates citations.

3. In a disposable PostgreSQL test database, insert, retrieve, update, and

   delete representative and maximum-size `TEXT` rows. Measure query latency,

   row/table/index size, TOAST behavior as applicable, and concurrent cache

   lookup/refresh behavior.

4. Confirm normal cache lookups select metadata first or otherwise avoid

   loading large Markdown when not needed; verify parameterized query plans and

   indexes for actual cache key lookup.

5. Record exact tested sizes and DB version/configuration. Do not generalize

   the result to production until the production database configuration is

   known.

**Dependencies:** Phase 1 and 2; PostgreSQL version/environment; approved

content-size and retention policy; migration/recovery plan.

**Tests/evidence:** cache hit/miss/14-day boundary/stale refresh success/failure,

failed write, parallel refresh, identity separation, size rejection, and

PostgreSQL storage/performance checks.

**Exit gate:** 14-day semantics and failed-refresh behavior are proven against a

disposable PostgreSQL database; no test uses production learner data.

### Phase 4 — MCP caller identity and independent-use boundary

**Purpose:** explain and enforce who the external caller is and which records

they may access.

**Planned work:**

- Replace the single shared-token/demo-teacher authorization assumption for

  production use with a reviewed authenticated identity mechanism and

  server-side mapping from authenticated principal to teacher, school, and

  tenant authorization.

- Keep server authorization authoritative for every read/write tool. Never

  trust a model- or client-supplied teacher/school ID as proof of permission.

- Define least-privilege scope for read-only evidence, observation writes,

  suggestion creation, suggestion acceptance, and any provider side effect.

- Record authenticated actor/tenant IDs on relevant audit events without

  putting bearer tokens or secrets in logs.

- Support discovery and safe independent-client calls against the actual

  Streamable HTTP endpoint; keep React state out of the tool contract.

- Clearly distinguish DIRA-hosted data from caller-owned data. The default

  contract remains DIRA-hosted records authorized for that caller. Access to a

  caller's own DB requires a separately approved deployment, import, or adapter

  design; tools must not accept connection strings/passwords from callers.

- Keep demo operation explicit, isolated from production learner data, and

  visibly distinguishable in logs and documentation.

**Dependencies:** identity and tenant model approval, deployment configuration,

privacy/security review.

**Tests/evidence:** valid identity, no identity, expired/revoked credential,

cross-school/tenant read and write denial, role-limited calls, independent

discovery, read-only invocation, and mutation attempts with no authorized

identity. Use synthetic records only.

**Exit gate:** caller identity is authenticated and every tool enforces

record-level authorization; otherwise label external MCP access demo-only.

### Phase 5 — Scheduled-agent integration and automatic execution

Purpose: prove that scheduled follow-up work is actually triggered and that
the bounded agent executes its runtime-selected permitted tools using real tool
results, without requiring a developer to manually trigger each run.

Planned work:

Select the actual scheduler only after the target deployment environment is
confirmed. Document its lifecycle, timezone, cadence, pause/disable behavior,
retries, and monitoring as implementation decisions—not assumptions.
Integrate the selected scheduler with the existing queue/trigger path; do not
create a second scheduler if the current mechanism can be extended safely.
Enforce durable job identity/idempotency and overlap protection after reviewing
current database constraints. Do not blindly repeat external side effects when
a prior call's outcome is ambiguous.
Verify the model can request permitted tools at runtime, the application executes
those requests, and actual results are fed back before the next decision.
Distinguish this from Suggest Test's intentionally constrained fixed workflow.
Enforce existing or explicitly approved bounds for model turns, tool calls,
per-tool operations, total runtime, and retries. Prevent self-approval and
approval bypass.
Use the Phase 0 logging contract for event shapes and correlation IDs, but do
not couple acceptance to the frontend log page being complete.
Tests/evidence:

Demonstrate an automatically due scheduled job being picked up and executed by
the configured scheduler in a controlled environment. A manual POST to the
protected endpoint alone is not acceptance evidence.
Demonstrate runtime tool selection, execution, result consumption affecting a
subsequent decision, bounded termination, tool failure behavior, duplicate
trigger protection, and safe retry behavior.
Record scheduler configuration, trigger evidence, run/job IDs, and persisted
database evidence. Use synthetic data and a disposable test database.
Exit gate: automatic scheduled execution and bounded runtime tool selection
are demonstrated end to end, with duplicate triggers safe. If the actual scheduler
cannot be run in the available environment, mark the deployment criterion
UNVERIFIED and do not claim automatic scheduling is complete.

### Phase 6 — Persisted run/event logging and correlated observability

Purpose: implement the agreed event contract so real scheduler, agent, model,
MCP, retrieval/cache, persistence, and approval activity can be reconstructed
from authorized persisted records.

Planned work:

Implement the Phase 0 event contract using the existing logging schema/service
where possible; use additive migrations and avoid a parallel logging system.
Propagate one run ID across scheduler trigger, route, graph stages, model calls,
tool calls, cache operations, persistence, retries, and final result.
Record actual executed calls separately from model-proposed, blocked, or rejected
calls. Persist start, completion, failure, retry, and partial-run outcomes.
Include timestamps, duration, status, attempt number, safe inputs/outputs or
references, errors, cache events, and authenticated actor references when
available. Redact secrets and minimize learner data.
Make logging persistence failure visible; a run must not silently appear fully
auditable if required events could not be stored.
Instrument Fetch/cache and scheduler/agent operations against the same contract.
Cache hits must not be recorded as external Fetch MCP invocations.
Tests/evidence: event ordering, run-ID propagation, proposed/executed/blocked
call distinctions, tool failure and timeout, retry, log-write failure, safe
redaction, and reconstruction from database rows alone.

Exit gate: at least one successful and one failed/retried synthetic run can be
reconstructed from persisted records without relying on console output or source
code; actual and proposed actions are distinguishable.

### Phase 7 — Frontend agent activity log integration

Purpose: display persisted backend events accurately in the existing agent
logs page, without redesigning unrelated DIRA screens.

Planned work:

Connect the existing page to the authorized API backed by Phase 6 persisted
records. Reuse current UI patterns and API conventions.
Show available run/workflow IDs, trigger, timestamps/duration, status, stages,
tool/cache actions, model usage/cost availability, retries, errors, and actual
approval events. Use expandable details where useful.
Represent missing/unavailable data honestly. Do not fabricate progress, success,
usage, cost, or approval state. Do not expose private model chain-of-thought,
secrets, or unauthorized learner data.
Keep the scope to agent activity logs and the previously approved hiding of the
/try-this sidebar link. Do not redesign the dashboard or learner screens.
Verify the UI against actual persisted event IDs and API responses in the VS Code
integrated browser when available; if unavailable, document the alternative
verification and mark integrated-browser verification UNVERIFIED.
Tests/evidence: loading/empty/running/completed/failed/partial-cost states,
API/UI consistency with stored records, sorting/filtering if present, access
control, and responsive behavior of the existing log page.

Exit gate: the UI shows only persisted authorized events and matches backend
state; unrelated UI remains unchanged.

### Phase 8 — Model usage and cost reporting

Purpose: accurately report measured model cost when provider usage and
verified pricing are available, and explicitly show unknown or partial values
otherwise.

Planned work:

Preserve provider/model identifiers and provider-returned input, output, and
cached-token usage where available through the adapter and call lifecycle.
Associate each call, correction attempt, retry, and billable failed call with
the correct run ID and persisted model-call event.
Maintain traceable model-specific rates with source, currency, effective date,
and calculation version. Do not assume model names or rates without verification.
Aggregate per-call costs at run level; distinguish measured/calculated model
cost from unmeasured Fetch MCP, infrastructure, database, network, and other
operational costs. Missing usage or rates must not become zero.
Add an end-to-end fixture proving usage survives provider response → adapter →
call event → run aggregate → API → frontend. Independently verify arithmetic.
Dependencies: provider usage/rate verification and Phase 6 event schema.

Exit gate: a reviewer can reproduce the run's measured cost from stored call
usage and the rate version; incomplete or unknown totals are labelled honestly.

### Phase 9 — Regression, integration, and practical scenario evaluations

Purpose: verify required behavior through executed tests rather than code
presence or assumed capability.

Required checkpoints:

Baseline checkpoint (before any implementation): record the safe existing
test commands, commit/version, environment, pass/fail counts, and known
failures. Do not run the mutating npm run mcp:test against shared data.
Per-phase checkpoint: after each phase, run its targeted tests and the
relevant regression subset before continuing. Record failures and stop if a
phase gate fails.
Final checkpoint: after all implementation phases, run the full applicable
regression, type/build checks, integration tests, and the evaluation matrix.
Do not conceal earlier failures; document fixes and final reruns separately.
Test safety: unit tests should mock external services; database integration
tests must use the guarded disposable/loopback PostgreSQL database. Any live
Fetch MCP/provider test must be approved, bounded, credential-safe, and use only
approved public URLs and synthetic data. Do not use production learner data.

Planned coverage:

Existing observation validation, idempotency, review, suggestion, evidence
reasoning, source filtering/ranking, and follow-up lifecycle behavior.
Fetch adapter and protocol, cache hit/miss/14-day boundary, failed refresh,
stale policy, size limits, PostgreSQL round-trip and concurrency.
Independent public MCP HTTP discovery and safe invocation; authorization tests
must distinguish the challenge demo from production identity guarantees.
Automatic scheduler invocation, runtime tool selection, duplicate triggers,
timeout/retry, and run reconstruction.
Frontend log API/UI consistency and authorization.
Model usage/cost calculations, missing metadata, retries, and unknown rates.
Retrieval latency on cache hit/miss and total request latency against the
approved budget; include restricted, missing, oversized, malformed, and timeout
cases in the controlled test set.
Existing commands currently present include npm run test:suggest-test and
npm run test:follow-ups (the latter requires the guarded local test DB). Future
Fetch MCP, independent HTTP MCP, and end-to-end commands must be added and reviewed
as implementation work; they are not existing commands today. Run build/type
checks only after approved changes and dependencies are available.

Exit gate: all required scenarios have an evidence-backed status; regressions
are fixed or explicitly accepted by a human owner. Do not edit EVALS.md in this
phase. Preserve command output, test reports, run IDs, and failure details as
implementation evidence for Phase 10 documentation.

### Phase 10 — Documentation, EVALS.md, and handover

This is the only phase authorized to edit documentation other than
final_implementation.md. It starts only after the approved implementation,
per-phase tests, and final evaluation run have completed. Until then, do not edit
EVALS.md, README files, architecture/MCP docs, environment examples, or other
documentation.

Before editing any documentation, inspect the actual current Git worktree and
relevant diffs. A previous status report said EVALS.md was modified, but a later
reset/revert may have changed that state. Do not assume either that the change
still exists or that it is safe to overwrite; preserve whatever work actually
exists and ask before resolving conflicting edits.

Documentation work:

Update EVALS.md using evidence preserved during Phase 9. Record the test
command/procedure, date, environment (without secrets), scenario, expected and
observed result, evidence/run reference, status, limitations, and follow-up.
Distinguish planned, executed, blocked, and unverified tests. Never mark a case
PASS because a test file exists.
Update MCP docs with verified connection/discovery prerequisites, transport,
authentication, caller identity, permissions, data prerequisites, schemas,
independent-client example, error behavior, and demo/production distinction.
Update architecture/integration/data-model docs only where the verified final
implementation makes them necessary; describe the Fetch boundary, cache policy,
scheduler, event tracing, schema, storage limits, and rollback.
Update README/developer/deployment instructions only with verified setup,
environment-variable names, migrations, safe test DB, scheduler operations,
test commands, frontend log verification, and troubleshooting.
Update .env.example only for confirmed non-secret configuration names and
safe placeholder values. Never include real credentials or production data.
Ensure each statement distinguishes verified architecture, verified runtime
behavior, intended/unimplemented behavior, unverified behavior, or limitation.
Exit gate: documentation matches verified behavior, all evaluation scenarios
have explicit evidence-backed statuses, unresolved limitations are visible, and
no secrets or sensitive learner data are included.

## 6. Evaluation matrix and initial status

The following is an implementation/evaluation plan. Statuses in the

“Evidence-backed status now” column reflect only evidence available at planning

time; they are not future results. Future execution details must be appended to

the maintained evaluation record only after the test/procedure actually runs.

| # | Evaluation and objective | Risk/requirement; level and prerequisites | Exact command/procedure planned | Expected behavior | Evidence-backed status now; known limitation |

|---:|---|---|---|---|---|

| 1 | **Normal observation:** validate and persist teacher input, then verify its use and trace. | Observation integrity; integration/E2E. Requires synthetic learner, authorized teacher, disposable DB, valid submission ID. | Future safe observation integration test; existing `npm run mcp:test` is mutating and must not be used without replacing/isolating its fixture path. Run `npm run test:follow-ups` only if observation coverage is included and local DB guard passes. | One valid row, preserved original wording/provenance, actual tool execution, idempotent retry, linked evidence and correlated logs. | **NOT TESTED** for complete scenario. Related observation/review tests exist but were not executed in the audit; current MCP client script consumes an accepted test. |

| 2 | **Missing evidence:** ensure insufficient or unreviewed evidence cannot create an unsupported proposal. | Evidence safeguards; unit + graph integration. Requires synthetic empty/unreviewed learner fixtures. | `npm run test:suggest-test`; add/execute graph assertion that no model generation or persistence happens when preparation rejects evidence. | Explicit insufficiency/review result, no invented history, no suggestion persistence. | **PARTIAL**: pure evidence-preparation tests passed; complete graph/API behavior for missing evidence is not established by those tests. |

| 3 | **State-dependent tool selection:** establish whether agent action and next step change with state/results. | Bounded autonomy; unit + controlled integration. Requires deterministic mocked model outputs and tool results. | Future targeted scheduled-agent test and Suggest Test graph test; run through the same Vitest unit suite after adding tests. | Actual permitted tool call is executed; result is returned and changes the next action; limits and termination hold. | **NOT TESTED** as an agent-selection scenario. Static inspection shows Suggest Test tools are called in fixed order and its model call receives no tools. |

| 4 | **Tool failure:** verify failure detection, logging, safe termination/recovery, and no unsupported output. | Reliability/audit; unit + integration. Requires injected MCP failures. | Future MCP failure-injection tests; run `npm run test:suggest-test` after adding coverage. | Failure is distinguished from success, correlated to run, recovery or stop is explicit, no false recommendation/persistence. | **PARTIAL**: a mocked model-outage test passed and confirms no fallback proposal; MCP tool failure/recovery was not tested. |

| 5 | **Recoverable timeout:** verify bounded timeout behavior, retries, idempotency and accurate final state. | Reliability/side-effect safety; unit + integration. Requires fake timers/timeout tool and disposable DB for write retry. | Future timeout/retry tests; separate opt-in local DB test if writes are involved. | Timeout is logged; explicit retry bound; no duplicate write/dispatch; final status is truthful. | **NOT TESTED**. Existing model timeout configuration is not evidence of tool-timeout recovery. |

| 6 | **Conflicting evidence:** preserve inconsistent reports and qualify/stop rather than silently resolve conflict. | Evidence reliability; unit + graph integration. Requires paired synthetic conflicting observations. | `npm run test:suggest-test`; add graph assertions for both citations and qualified output. | Both records remain traceable; conflict/variation is visible; no unsupported certainty. | **PARTIAL**: pure tests passed retaining different reports/variation IDs; semantic conflict analysis and end-to-end qualification remain unverified. |

| 7 | **Unsupported claim:** reject invented source references and distinguish citation existence from claim support. | Grounding; unit + integration. Requires model fixtures with fabricated IDs and irrelevant real IDs. | `npm run test:suggest-test`; add tests for both nonexistent citations and unsupported claims citing existing but irrelevant records. | Fabricated IDs are rejected; unsupported claims are qualified/rejected; outcome is logged and not persisted as fact. | **PARTIAL**: fabricated citation IDs are tested in evidence reasoning; semantic support of claims citing a real but irrelevant record is unverified. |

| 8 | **Approval bypass:** try protected acceptance/release without authorized human identity. | Governance; API/MCP integration. Requires synthetic proposal and unauthenticated/underprivileged caller. | Future non-production endpoint/MCP test using disposable DB and synthetic identity; never send to a real release/guardian channel. | Backend denies the attempt; proposal state unchanged; denial event records actor/attempt safely. | **NOT TESTED**. No complete approval-bypass test was executed; current auth context is demo-resolved. |

| 9 | **Agent self-approval:** ensure an agent cannot accept its proposal or invoke a protected action. | Separation of duties; unit + integration. Requires agent tool allowlist inspection and synthetic invocation. | Future scheduled/Suggest Test tool allowlist test plus MCP authorization attempt; execute in isolated test environment. | Agent tool unavailable/rejected; no status transition; rejection is recorded. | **NOT TESTED**. Existing agent tool-set inspection is static evidence only; public MCP exposes `accept_suggested_test`. |

| 10 | **Audit reconstruction:** reconstruct a run from persisted records. | Accountability; DB integration + manual verification. Requires one completed synthetic run and one failed/retried run. | Future run an approved synthetic scenario, then use the authenticated log API/DB read-only query to reconstruct events without application source. | Distinguish model request, proposed/executed/blocked tool calls, inputs/results or safe references, errors/retries, evidence, approvals, costs and final outcome. | **NOT TESTED**. Current active workflows do not create a complete persisted run/event history. |

| 11 | **Automatic scheduled execution and duplicate-trigger protection.** | Operational reliability; integration/manual deployment verification. Requires selected scheduler, local test DB, mock provider. | First run `npm run test:follow-ups`; then invoke the deployment scheduler against a non-production endpoint with the same approved idempotency key twice. | Scheduler starts at configured cadence; duplicate trigger does not create duplicate jobs or calls; retries are safe; disable/pause works. | **NOT TESTED**. Trigger route exists; no hosting scheduler is selected/configured in the repository. |

| 12 | **Independent external MCP discovery and invocation.** | Reusability/interoperability; protocol integration. Requires approved server URL, credentials, synthetic identity/data and read-only call. | Future dedicated non-mutating client test against `POST /api/mcp/server` using configured Streamable HTTP transport; record `listTools` and a safe read-only invocation. | Caller discovers actual tools, constructs schema-valid request, receives structured output/error, and authorization scopes records correctly without React state. | **UNVERIFIED**. In-process discovery test does not verify public HTTP/auth or independent caller identity. Keeper and Fetch are separate external integrations and require their own tests. |

| 13 | **Fetch MCP cache hit, miss, refresh, failure and 14-day freshness.** | Retrieval correctness/availability; unit + PostgreSQL integration + controlled external test. Requires Fetch tool contract, DB migration, mock clock and approved URL fixtures. | Future cache/retrieval suite, then safe loopback PostgreSQL integration; live Fetch call only with explicit approval. | Fresh hit avoids remote call; miss fetches; stale refresh updates only on success; at 14-day boundary stale entry refreshes; failure preserves row but returns no stale content under proposed policy. | **NOT TESTED**. Fetch MCP and cache are not implemented. |

| 14 | **PostgreSQL Markdown storage and large-content handling.** | Data integrity/performance; PostgreSQL integration. Requires disposable DB, measured representative and maximum Markdown fixtures, agreed size cap. | Future storage benchmark in the guarded local `dira_dev` test environment; record exact UTF-8 bytes, DB version, query, latency and table/TOAST size. | Full allowed content round-trips intact; oversized content rejects clearly; lookup avoids loading bodies unnecessarily; indexes meet measured lookup need. | **NOT TESTED**. No Markdown cache schema exists; PostgreSQL suitability is not asserted without measurement. |

| 15 | **Model usage capture and cost calculation.** | Cost transparency; unit + provider contract verification. Requires provider usage samples, dated price source and known fixtures. | Future mocked usage/rate tests; one controlled provider call only if explicitly approved. Independently recompute fixture totals. | Aggregate measured input/output/cache usage across calls and retries; use dated model-specific rates; missing usage/rate reports unknown, not zero. | **NOT IMPLEMENTED / NOT TESTED**. Model response adapter currently omits usage fields; no cost calculation exists. |

| 16 | **Frontend agent-log accuracy and authorization.** | Audit/UI privacy; API + component tests. Requires synthetic logs and distinct authorized/unauthorized identities. | Future authenticated route/component tests; inspect UI against persisted event IDs and API output. | UI shows only persisted events, truthful statuses, correct filters/order and authorized scope; no client-invented success or sensitive cross-tenant data. | **PARTIAL** static evidence only. Log routes exist, but primary agent logs are not fully persisted and authentication is demo-scoped. |

| 17 | **Regression tests for existing working functionality.** | Preservation; unit + guarded integration/build. Requires dependencies and safe local DB for integration. | Run `npm run test:suggest-test`, `npm run test:follow-ups` only against the guarded loopback DB, and `npm run build`; record each command/result separately. | Existing observation, evidence lifecycle, safety, retrieval, schedule and UI behavior remains correct; no unexplained regression. | **PARTIAL** baseline only: 19 isolated Vitest tests and 18 deterministic node tests passed in the prior audit; integration/build results are not established by those runs. |

Evaluation statuses must be updated with date, exact command/procedure,

environment, commit/version if applicable, test names, actual result, artifact or

log reference, and limitation. Do not replace a failure or a blocked run with a

later pass; retain both with context.

## 7. Fetch MCP justification and architecture decision

### Problem and current alternative

The reported 403, 404, oversized-response, timeout, extraction-failure, and

long-request symptoms are reasons to investigate retrieval, not proof that a

specific component caused every failure. The existing direct retrieval

implementation already includes:

- Official-domain checks for the configured IB, EEF, AMI, and WWC source

  families, including a final response URL check.

- Sitemap/robots discovery, a cap on sitemap/page bytes, a maximum candidate

  page count, a per-source timeout, simple HTML/plain-text extraction, and

  relevance ranking.

- Per-source failure statuses and logging, with retrieval from other sources

  continuing when a source fails.

Those safeguards should be preserved and evaluated. The alternative is not

"Fetch MCP works versus no retrieval"; it is **extend and maintain this direct

retriever** versus **use a verified Fetch MCP Markdown extraction capability

behind the existing DIRA retrieval abstraction**.

### Provisional rationale and required proof

The concrete potential architectural advantage is reuse/interoperability: if a

verified Fetch MCP provides a stable, bounded, testable MCP tool that converts

eligible public pages into validated Markdown, DIRA may avoid expanding its own

HTML extraction/parser logic while preserving DIRA-owned source selection,

domain policy, evidence ranking, and Suggest Test contract.

This is only a provisional rationale. Before approval to ship, compare both

approaches for:

- Markdown readability, title/page URL fidelity, extraction quality and

  citation fidelity for the same allowed URLs.

- 401/403, 404, oversized, malformed, non-text, redirect, timeout, network and

  partial responses.

- Domain/redirect enforcement and whether the Fetch server causes requests to

  a URL outside DIRA's allowlist.

- Median/tail latency across several sources and total suggestion workflow

  duration, including cache miss and cache hit.

- Tool schema stability, independent protocol discovery, maintenance burden,

  operational availability, authentication/permissions, rate limits and costs.

- Terms/licensing, data handling, content retention and whether returned

  Markdown may be cached/used as proposed.

Do not claim Fetch MCP bypasses access restrictions or guarantees extraction.

If it offers no meaningful advantage or cannot preserve source restrictions,

stop and ask for a design decision rather than integrating it by default.

### Required integration boundary

`retrieve_education_resources` remains the public DIRA tool. It continues to

own/coordinate source eligibility, selection, ranking, status, output shaping,

and the downstream evidence workflow. Fetch MCP is an internal retrieval

capability invoked by the existing service only after DIRA validates an

eligible candidate URL. No parallel education-retrieval pipeline should be

introduced.

Any necessary result-contract change must be documented and backward

compatibility tested. Cache hits and Fetch MCP calls must be distinguishable in

logs; a cache hit is not evidence of a successful Fetch MCP request.

## 8. 14-day PostgreSQL cache and content storage plan

### Proposed freshness semantics

- Freshness duration: 14 days from last successful, validated Fetch MCP result.

- Successful refresh: transactionally replace content/metadata and update

  last-success timestamp only after validation and persistence succeed.

- Failed refresh: retain the old row unchanged; do not extend freshness.

- Proposed initial stale policy: no stale-content fallback into the model

  context. Return an explicit per-source failure/no-result while preserving the

  old row for diagnostics or a later successful refresh.

- Cache miss and expired entry trigger Fetch MCP; fresh hit does not.

- A fresh page is still passed through current DIRA relevance selection for the

  current query. The cache does not store a prior suggestion or deem content

  relevant for all future queries.

### PostgreSQL schema/storage validation

Before approving a migration, verify expected content size from representative

sources and actual Fetch MCP responses. The current direct HTML page cap is

128,000 bytes; it is not proof of the size distribution of extracted Markdown.

Use a measured percentile/max and an agreed strict cap. Store Markdown in

PostgreSQL `TEXT` only if the approved content terms permit it and the DB tests

confirm safe write/read/lookup behavior.

Exercise realistic sizes, including the largest allowed record, on the same

PostgreSQL major version/configuration intended for deployment. Verify

UTF-8-safe round trips, oversized rejection, TOAST/storage behavior, write and

read latency, index size, concurrent access, query plans, backups/restore

implications, and that cache-key lookups do not unnecessarily retrieve the

Markdown body. Include result measurements in the final handover.

Cache only public/approved material; public accessibility does not itself grant

unlimited storage or reuse rights. Respect terms, robots behavior, copyright,

retention, and any Fetch MCP data processing terms. Do not store blocked

content, credentialed content, learner content, or arbitrary user-submitted

URLs.

## 9. External MCP, caller identity, and database prerequisites

The future external-MCP guide must distinguish:

1. **Transport/server:** exact supported endpoint and entry point, transport

   (Streamable HTTP or stdio only if separately supported), TLS expectations,

   tool discovery and version.

2. **Caller identity:** how the individual caller is authenticated,

   authorization/role mapping, revocation, tenant scoping, and audit identity.

3. **Data source:** DIRA's server-side database is used for current learner

   tools. The external caller's own database is not implicitly used. Current

   tool schemas do not accept a DB connection string or an arbitrary evidence

   bundle for `suggest_test`.

4. **Permissions/prerequisites:** which tools read or mutate records, what

   pre-existing learner/evidence/recording/job is required, and which calls

   incur external-provider activity.

5. **Safe minimal client:** provide an independently reproducible client sample

   only after verifying actual endpoint, auth, schemas and a non-mutating read

   call. Keep secrets in server-side environment/secret storage; never paste

   real credentials into examples.

6. **Demo vs production:** document the existing shared-token/demo identity as

   demo-only until replaced. Do not present it as individual teacher

   authentication.

If support for caller-owned data is desired, create a separately reviewed

contract that accepts a validated data payload or a controlled deployment-side

adapter. Do not let a remote MCP client supply arbitrary SQL, hostnames,

database URLs, usernames, or passwords. Identify data ownership, validation,

retention, and cross-learner isolation before adding such a capability.

Keeper calendar MCP remains a separate integration. It must not be reported as

Fetch MCP and must not be inferred to be connected just because `.env.example`

contains `KEEPER_MCP_URL`.

## 10. Scheduled agent, run IDs, logs, and cost handover

The final implementation/documentation must make it possible for an operator to

answer from persisted, authorized records:

- What trigger/request began the run and who/what initiated it?

- Which workflow/model/version ran, and when did it start/end?

- What tools did the model propose, what did DIRA execute, what was blocked,

  and why?

- Which safe inputs/results or source-record references were involved?

- Which cache and external Fetch MCP events occurred?

- Were there retries, failures, timeouts, or ambiguous side effects?

- What was the final run status and why?

- Which model calls included actual provider usage, what rate version applied,

  and what direct model cost was measured/calculated?

- Which actions required human review and what authenticated decision occurred?

Use one run ID across route, graph, model event, tool event, cache event, and

final result. Record actions, not model private reasoning. Protect records with

appropriate access control, avoid logging secrets or unnecessary learner text,

and clearly expose log persistence failure.

Deployment documentation must identify the actual hosting scheduler and explain

how it starts/calls the protected trigger, time zone, schedule, idempotency,

retry/overlap policy, monitoring, pause/disable, and recovery. The repository

currently does not select a scheduler; do not write vendor-specific instructions

until the team chooses one.

Cost docs must specify:

- Provider/model and whether usage fields are returned and retained.

- Input/output/cached token fields where applicable.

- Source and effective date of pricing and currency.

- Formula and rounding, per-call/per-run aggregation, and retry/failure

  accounting.

- Treatment of missing usage/rates as unknown.

- Explicit exclusion or separate reporting of Fetch MCP, network, database,

  hosting, and other operational costs.

## 11. Risk register and mitigations

| Risk | Potential impact | Planned mitigation / decision gate |

|---|---|---|

| Fetch MCP returns unsafe redirects or non-approved domains | SSRF, untrusted content, policy bypass | Validate URL before request and returned/final URL after response; block private/local targets and fail closed; test redirect cases. |

| Fetch MCP does not improve extraction or latency | Added dependency without user value | Run Phase 1 comparison; do not ship without a human-approved advantage. |

| Fetch server outage or slow response | Suggestion latency or missing external context | Bounded timeout, explicit per-source failure, no hidden/unbounded retries, safe no-resource behavior; do not fabricate citations. |

| Cache uses stale/incorrect page content | Misleading citations or old guidance | 14-day successful-refresh rule; proposed no stale fallback; cache key includes canonical URL/source and needed format version; preserve retrieval timestamp. |

| Large Markdown rows impair database operations | Storage/backup/query cost | Measure realistic/max content and PostgreSQL behavior before migration; cap content; avoid loading bodies for metadata-only lookup. |

| Cache violates source terms or retains content improperly | Legal/privacy/operational risk | Review source terms and provider handling; cache only permitted public material; approved retention and deletion policy. |

| Shared token misidentifies MCP caller | Cross-teacher/tenant access or false audit attribution | Per-principal authentication and server-side authorization; until then, explicitly demo-only and synthetic data only. |

| Caller expects DIRA to query their database | Incorrect results, credential exposure | Document DIRA-hosted data prerequisite; prohibit client DB credentials; separate adapter/import proposal requires approval. |

| Scheduler retries after uncertain call outcome | Duplicate external side effect | Durable idempotency/atomic job claims, no blind retry on ambiguous provider result, duplicate-trigger tests. |

| Logging records sensitive learner text or leaks secrets | Privacy/security breach | Allowlist fields, redact tokens, use record references, role-protect log APIs, retention review and tests. |

| Model usage metadata absent/incomplete | Cost under-reporting | Mark cost unknown when unmeasured; no zero fallback; provider contract test and rate-version provenance. |

| Existing EVALS.md change is overwritten | Loss of unrelated/pre-existing evidence | Preserve current worktree state; inspect diffs before doc phase; merge targeted updates only with owner approval. |

| Public tool/response contract changes unexpectedly | Independent client breakage | Keep service integration behind existing MCP tool; contract snapshots/compatibility tests; version any unavoidable breaking change. |
| Fetch MCP causes regression after rollout | Retrieval unavailable or slower | Use a reviewed disable/rollback switch to restore the existing direct retriever; keep cache data intact; test old-path operation and migration rollback before rollout. |

## 12. Overall acceptance criteria

The future implementation is ready for handover only when all applicable

criteria have execution evidence:

1. Fetch MCP has been independently discovered and invoked; its exact

   capability, auth, schema, failures and data handling are verified.

2. A controlled comparison with the existing retriever supports a concrete

   adoption rationale; otherwise the Fetch change is not represented as an

   improvement.

3. The existing education retrieval tool/workflow remains the owner of source

   policy and ranking, with contract compatibility proven.

4. A PostgreSQL Markdown cache implements 14-day freshness based solely on

   successful validated retrieval. Miss/hit/refresh/failure and the stale policy

   are tested; failed refresh leaves valid previous content and freshness

   unchanged.

5. PostgreSQL behavior is measured using realistic large Markdown sizes and the

   target DB version; the accepted maximum, storage/query results, and retention

   policy are documented.

6. No restricted page, arbitrary URL, caller-supplied DB endpoint, or

   cross-tenant record is used or exposed through the integration.

7. An independent MCP caller can discover/use permitted tools without React

   state; caller identity and permissions are authenticated and enforced.

8. The scheduled execution mechanism is explicitly selected/configured,

   duplicate triggers are safe, and ambiguous external call outcomes are not

   blindly retried.

9. A reviewer can reconstruct a run from persisted correlated records with

   actual/proposed/blocked actions, failures/retries, evidence references, and

   authenticated approval outcomes distinguishable.

10. Model usage/cost is reproducibly calculated when provider data and dated

    rates exist; otherwise the missing value is clearly reported as unknown.

11. The ten primary scenarios and seven additional evaluations have explicit

    statuses supported by actual executions. Blocked, unverified and not-tested

    results remain visible.

12. Regression tests pass for preserved functionality; any accepted failure is

    documented with impact and owner.

13. Documentation and examples match verified behavior and contain no secrets,

    production learner data, or unsupported capability claims.

14. Git review confirms that implementation edits are limited to approved

    scope, migrations are reversible/operationally documented, and no unrelated

    pre-existing changes were removed.

**Current task completion condition:** deliver this plan only, confirm no files

other than `final_implementation.md` were modified by this task, preserve the

the current `EVALS.md` worktree state rather than assuming its earlier status, and stop for explicit human approval.

