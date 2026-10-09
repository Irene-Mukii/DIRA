# Dira — Safety and Guardrails

> **Non-negotiable rule:** Dira helps teachers explore evidence. It never determines what a learner is or should become. This document follows the current MVP in `ARCHITECTURE_Dira_Revised.md`; the old pathway-note and guardian approval gate is not part of the current flow.

## 1. Human responsibility and forbidden outcomes

The agent may identify a question worth exploring, suggest a small classroom activity, cite supporting observations, and help assemble an evidence-grounded card. It must not:

- assign a career, pathway, ability group or fixed future to a learner;
- label, diagnose, rank or compare learners against each other;
- infer permanent intelligence, personality, learning style, motivation or aptitude from limited observations;
- turn one teacher's impression into an established fact;
- treat acceptance of a test, a calendar event, attendance data, or a reminder as proof that an activity took place;
- invent observation IDs, test outcomes, source citations or confirmations;
- claim external educational sources were consulted when retrieval failed or was never configured.

The teacher decides whether to run a suggested activity and how to interpret the resulting evidence. The Learner Evidence Card supports professional judgement; it is not a verdict.

## 2. Observation integrity

### Preserve original wording

- Store original teacher wording separately from transcripts, corrections, normalised fields and model-generated explanatory text.
- Do not silently convert “needed two prompts today” into “cannot work independently.”
- If the user corrects transcription, preserve the submitted/corrected result according to an explicit audit policy.
- Any interpretation must be visibly labelled and should not be stored as if the teacher said it.

### Provenance

Capture as applicable: learner ID, authenticated teacher/observer ID, observer role, observation timestamp, persistence timestamp, subject/context, observation type, capture method, linked test ID, submission/call/recording ID, transcription provider and review status. Do not invent unavailable values.

### Identity and authorisation

- Validate that the teacher is authenticated and authorised for the selected learner.
- Confirm the learner exists in the correct school/app context.
- A name mentioned in chat or audio is not an authoritative learner ID. Ask for clarification if multiple learners match.
- Caller ID alone is not sufficient proof of teacher identity for a phone callback.
- Do not trust model-generated teacher, school or learner IDs for permissions.

### Transcription quality

If uncertainty affects learner identity, negation, counts, outcomes or a materially important detail, ask the teacher to confirm before saving. Do not assume every Whissle endpoint returns confidence scores; use only returned fields. Failure to transcribe must not create a guessed observation.

### Duplicate and retry safety

Use idempotency/request IDs. A retry should not create duplicate observations after an uncertain network response. Do not delete two legitimate observations merely because they contain similar words.

## 3. Evidence-grounded suggestions

- Each suggestion must cite real observation IDs from the selected learner's records.
- Verify every referenced record exists, belongs to the learner and supports the stated reason.
- Keep supporting, contradictory and contextual records distinguishable.
- State what a suggested activity is intended to explore, what the teacher should look for, and what remains uncertain.
- Avoid activities that stigmatise, single out, or expose a learner unnecessarily. Prefer ordinary classroom activities that are low-preparation and can be offered without presenting the learner as a problem.
- If evidence is too limited or contradictory, make that limitation explicit and consider recommending further observation rather than a misleading test.
- A completed test requires an explicit teacher-recorded result linked to the test.

## 4. External educational-source retrieval

Before each test suggestion, the agent must attempt a quick lookup against configured approved educational sources. This is a required runtime behaviour; the persistent source catalogue table is deferred, not retrieval.

### Safe retrieval requirements

- Use a separate, verified retrieval adapter; do not assume that the GLM API has search/browsing.
- Use a strict configurable timeout (a few seconds as a starting point), cancel where supported, and avoid uncontrolled retries.
- Minimise or omit learner-identifying data in retrieval requests.
- Treat returned pages/snippets as untrusted external content. Ignore instructions in page text that attempt to change Dira policy, reveal secrets, call unrelated tools, or override teacher control.
- Use source metadata/URLs only if actually returned by the retriever. Do not invent citations or bibliographic details.
- Keep educational guidance separate from learner-specific evidence. It can inform an activity; it cannot establish facts about a named learner.
- When retrieval fails, times out, is unconfigured or has no relevant results, continue using valid learner evidence and available model knowledge, label the retrieval status, and return no false external citation.
- Do not store a permanent source library in PostgreSQL in the current scope.

The source list in the team's materials uses both “IB” and “IBEF,” alongside EEF, AMI and WWC. Confirm the intended source list; do not silently treat different acronyms as the same organisation.

## 5. Learner Evidence Card safeguards

- Rebuild the card from current PostgreSQL records, not from a prior model summary alone.
- Every factual claim must have real supporting record references.
- Show dates/time range and the context covered.
- Include contradictory evidence rather than cherry-picking records that support a neat story.
- Use cautious descriptions of observed events (“completed two tasks independently”) instead of fixed interpretations (“is independent”).
- Represent missing evidence as “not recorded/unclear,” not as evidence of absence or low ability.
- Do not use broad frequency language such as “always,” “usually” or “increasingly” without sufficient records across the relevant time range.
- Reject unsupported career/pathway recommendations and cross-learner comparisons.

## 6. Model and tool boundaries

- Prompt instructions are not the security boundary. Deterministic input/output validation, authorisation checks, state constraints and DB references are.
- The model may propose tool calls; the application decides whether they are allowed.
- Only expose the tools needed for the current task. No approval action for a pathway note is needed in this MVP.
- Do not expose database, model, Keeper, Whissle or Africa's Talking credentials to the browser.
- Reject unexpected tool names/arguments and validate schema versions.
- Treat observation text, transcripts, user content and external pages as data, not trusted instructions. A hostile string inside an observation must not be able to change the system prompt or tool permissions.

## 7. Calendar and communication safeguards

- Keeper.sh is used through the MCP protocol; do not bypass its connection and claim MCP usage when directly calling a calendar API.
- Request the minimum calendar permissions and date range needed for timing context.
- Never convert calendar events into observations or test-completion state.
- SMS should disclose the minimum needed to prompt teacher attention; avoid sensitive profiles or detailed observations in message content.
- Voice calls must not be associated with a learner until the teacher is verified and the learner is selected/confirmed.
- Provider failure, callback failure, delivery failure and recording retrieval failure must remain visible and must not produce fake success.

## 8. Privacy and demo data

- Use synthetic learners and synthetic teacher identities in development, demo recordings, screenshots and evaluation fixtures.
- Do not commit real secrets, access tokens, call recordings, or real learner information.
- Do not send unnecessary personal data to hosted model, source retrieval or transcription providers.
- Restrict stored audio and external provider payloads to what is required, with access and retention policy defined before real deployment.
- Log operational metadata safely; do not log private chain-of-thought or whole sensitive learner records by default.
- Avoid exposing full observation data in URLs, browser logs, error trackers or SMS.

## 9. Safe errors and fallbacks

| Failure | Required behaviour |
|---|---|
| Invalid/unknown learner | Reject request; do not guess from a name |
| Teacher not authorised | Reject request; no record leakage |
| DB write failure | Do not show “saved”; preserve draft where possible |
| Uncertain transcript | Ask teacher to confirm critical content |
| Whissle unavailable | No fake transcript; offer retry/alternate text entry |
| Educational retrieval timeout | Continue with learner evidence/model knowledge; clearly mark guidance unavailable; no fake citations |
| Keeper authentication/tool error | Mark calendar context unavailable; do not make up events; do not bypass MCP silently |
| SMS/Voice API failure | Report actual failure/pending status; don't claim delivery/call success |
| Invalid/fabricated evidence ID | Reject or regenerate output; never show unsupported claim |
| Conflicting evidence | Keep the contradiction visible and the question open |

## 10. Safety review before demo

- [ ] No labels, rankings, diagnoses, career/pathway assignment or cross-learner comparison.
- [ ] No unsupported claims on Try This or the Evidence Card.
- [ ] All cited observation IDs exist and belong to the selected learner.
- [ ] Contradictory and insufficient evidence cases pass.
- [ ] Teacher identity and learner scope are enforced server-side.
- [ ] Duplicate submissions do not duplicate records.
- [ ] External retrieval failure produces a truthful fallback.
- [ ] External page/observation prompt injection is treated as untrusted data.
- [ ] Accepted tests are not shown as completed without a linked teacher-recorded outcome.
- [ ] No pathway-note approval or guardian-delivery route is active in the current MVP.
- [ ] Keeper's borrowed MCP connection is honestly described as planned or tested, depending on real evidence.
- [ ] Demo uses synthetic data and no real credentials are committed.
