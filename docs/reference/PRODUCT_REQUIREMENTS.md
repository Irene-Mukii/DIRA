# Dira — Product Requirements

> **Authority:** Reconciled to `ARCHITECTURE_Dira_Revised.md`. This file describes expected product behaviour, not current implementation status. See `EVALUATION_PLAN.md` for verification cases and `INTEGRATIONS.md` for provider status.

## 1. Requirement labels

- **P0 — Core:** required to demonstrate the current teacher-facing evidence loop.
- **P1 — Planned integration:** part of the intended product but may be pending provider credentials or verification; status must be made explicit.
- **Deferred:** intentionally excluded from the current scope.

## 2. Primary requirements

### P0 — This Week and learner discovery

**PR-01. Weekly focus list.** Dira shall present a small focus list of learners whose records have not been observed recently or whose evidence merits attention. Rotation shall prioritise least-recently-observed learners rather than random selection. The list must not be represented as a judgement about ability or risk.

**Acceptance criteria**
- Each item links to the correct Learner Record.
- The list can explain the operational reason a learner is included (for example, no recent observation).
- Missing data is described as missing data, not as a weakness.
- If SMS is enabled, the message is short, avoids unnecessary sensitive detail, and reflects actual provider status.

### P0 — Learner Record and evidence history

**PR-02. Longitudinal record.** The teacher shall be able to inspect the selected learner's saved observations and relevant questions/tests/outcomes.

**Acceptance criteria**
- An observation displays its date/time, observer, observer role where available, subject/context, type, capture source, and original recorded content.
- Evidence and interpretations are clearly differentiated.
- Observations are chronological and can be traced by stable IDs.
- Records for another learner cannot leak into the selected learner's view.

### P0 — Observation capture and persistence

**PR-03. Typed observation.** A teacher shall be able to capture a short text observation through the Log Observation chat-style screen.

**PR-04. Voice observation.** A teacher shall be able to record an in-app voice note, review the recording, and submit it for transcription. The resulting transcript must be validated before it becomes a saved observation. The original audio or an authorised reference to it and the transcript must remain distinguishable where retention is allowed.

**PR-05. Observation integrity.** `log_observation` shall preserve original wording and provenance and shall not infer learner traits, silently paraphrase the observation, or fabricate missing fields.

**Acceptance criteria**
- The teacher/learner association and permissions are validated server-side.
- Required fields are validated; ambiguous learner identity is resolved before saving.
- A transcription ambiguity that could change meaning (learner identity, negation, number, or key fact) causes clarification or a clearly blocked save, not an invented correction.
- Retries use an idempotency/submission identifier so one repeated request does not create duplicate records.
- The UI shows saved status and observation ID only after PostgreSQL persistence succeeds.
- Errors are visible and preserve the unsaved draft/recording where feasible.

### P0 — Suggesting a classroom test

**PR-06. Evidence-grounded suggestion.** When relevant evidence exists, Dira shall suggest one small, feasible classroom activity to explore a question that is not yet adequately tested. It shall provide the reason, what to observe, how to record the result, and exact supporting observation IDs.

**PR-07. Evidence sufficiency.** If the available learner evidence is too sparse, irrelevant, or badly conflicted to support a meaningful test, Dira shall say so, ask for more observation where useful, or qualify the suggestion. It shall not manufacture a pattern.

**PR-08. Educational retrieval attempt.** Before finalising each test suggestion, the agent shall attempt bounded external retrieval of relevant educational guidance. The source adapter must be separate from the GLM model API unless a search capability is explicitly documented and verified.

**Acceptance criteria**
- A suggestion contains an exploration question/hypothesis, activity steps, purpose, approximate duration or effort, what to observe, what to log afterward, limitations, and evidence IDs.
- Every evidence ID exists, belongs to the requested learner, and is relevant to the stated reason.
- Educational guidance citations are only shown when returned by the retriever and are kept separate from learner-specific evidence.
- Retrieval has a configurable strict timeout and does not block the teacher workflow indefinitely.
- Timeout, failure, or empty retrieval triggers a fallback to available learner evidence and model knowledge; the response accurately indicates that external guidance was unavailable and includes no invented source citation.
- No unnecessary identifying details about the learner are sent to the external retrieval service.

### P0 — Test lifecycle and teacher control

**PR-09. Teacher actions.** For a proposed test, the teacher shall be able to accept/plan it, defer it (`NOT_YET`), or request another suggestion.

**PR-10. State accuracy.** Accepting a test must not mark it complete. A test becomes completed only when the teacher records what happened, linked to that test.

**Acceptance criteria**
- Every state change is persisted and reflected in the UI.
- A regenerated suggestion has a new or versioned test identity so prior suggestions remain auditable.
- A deferred test remains distinguishable from a completed or rejected one.
- No outcome is inferred from a calendar event, suggested activity, or acceptance click.

### P0 — Learner Evidence Card

**PR-11. Evidence Card.** Dira shall present a teacher-facing summary of questions explored, tests conducted, and observed outcomes, assembled from underlying records.

**PR-12. Traceability and uncertainty.** Each factual claim must map to actual records. The card shall show its time window, relevant supporting observations, contradictions, open questions, and limitations.

**Acceptance criteria**
- The summary is regenerated from current underlying records rather than using a prior generated summary as the source of truth.
- Every displayed evidence reference is verified against PostgreSQL and the selected learner.
- Conflicting observations are retained and presented without artificial resolution.
- Absence of observations is represented as an evidence gap, not as proof of an inability.
- Language describes observed actions and contexts instead of permanent traits.
- The UI does not assign a learner a label, ranking, diagnosis, career, or pathway.

## 3. Planned integrations (P1 until verified)

**PR-13. Borrowed calendar MCP.** Dira shall connect through its MCP client to the existing Keeper.sh calendar MCP server, using the MCP transport and authentication required by the selected hosted/self-hosted configuration. Calendar results may support scheduling and timing context.

**Acceptance criteria**
- The team can show tool discovery and at least one real MCP tool call to Keeper.sh, with returned data and error handling.
- The code does not call Google Calendar's REST API directly and present that as the borrowed-MCP integration.
- Supported calendars are limited to what Keeper currently documents and the team actually configures; do not claim native Calendly support.
- Calendar events are not evidence that a lesson happened or a learner attended.

**PR-14. Speech-to-text.** The Whissle integration shall submit captured audio using its documented supported format and handle provider errors and timeouts without creating a fake transcript.

**PR-15. SMS.** Africa's Talking SMS may send a weekly focus reminder. Dira shall display or log the actual delivery status returned by the provider.

**PR-16. Outbound phone capture.** Where account capability and time permit, Africa's Talking Voice shall initiate the teacher follow-up call and connect its captured audio to the same Whissle → validate → `log_observation` flow. Caller ID alone is not sufficient teacher authentication.

## 4. Non-functional requirements

**NFR-01. Security:** authenticate/authorise server-side; secrets stay on the server; never trust model-generated IDs or client-supplied roles as proof of permission.

**NFR-02. Reliability:** apply explicit timeouts, structured errors, idempotency, safe retry behaviour, and visible processing states to external calls and writes.

**NFR-03. Auditability:** log tool name, run ID, timestamp, status, latency, relevant record IDs, and errors without storing private chain-of-thought or unnecessary sensitive learner content.

**NFR-04. Portability:** use the Next.js App Router and TypeScript in the main app; keep model and provider adapters replaceable. Python may be used for offline synthetic-data preparation scripts as described by the team plan.

**NFR-05. Usability:** core flows must work on phone-size and desktop layouts, use plain language, and require minimal typing.

**NFR-06. Data quality:** use synthetic learner histories for test/demo environments; include messy, incomplete, contradictory, and multi-observer cases.

**NFR-07. Honest status:** planned, selected, configured, tested, and working are separate statuses. Documentation and demos shall not imply an untested integration is complete.

## 5. Deferred and excluded requirements

- **Deferred:** a PostgreSQL table/catalogue/cache for educational-source metadata/content. External retrieval at suggestion time remains required now.
- **Excluded from current MVP:** pathway-note drafting and approval state machine, guardian approval or delivery, learner classification/ranking, continuous classroom audio, elaborate offline sync, and unverified provider functionality.
- **Needs explicit confirmation:** the shared build plan discusses an open-weight model as a challenge task, while the revised architecture currently selects GLM-5.3 and does not name a second model. Confirm the judging requirement and selected model before claiming that requirement is met.

## 6. MVP release gate

Do not call the current MVP demo-ready until the core observation → suggestion → teacher test action → linked outcome → Evidence Card loop works against synthetic data; educational retrieval both succeeds and times out safely; the card passes safety checks; and the actual state of Keeper.sh, voice, SMS, and model integrations is accurately documented.
