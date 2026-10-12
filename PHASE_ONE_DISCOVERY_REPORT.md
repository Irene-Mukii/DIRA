# Phase One Discovery Report: Evidence Assessment and Learner Evidence Card

## Executive Summary

This report documents the findings from inspecting the Dira repository to understand the current implementation state, database schema, and gaps that must be addressed to implement the Evidence Assessment and Learner Evidence Card feature.

---

## 1. Teacher Observations — Tables and Fields

**Primary Table:** `observations`

| Field | Type | Purpose |
|-------|------|---------|
| `observation_id` | TEXT (PK) | Stable primary key (UUID) |
| `learner_id` | TEXT | FK to learner |
| `teacher_id` | TEXT | FK to teacher |
| `school_id` | TEXT | FK to school |
| `class_id` | TEXT | FK to class |
| `academic_year` | INTEGER | Academic year context |
| `observation_date` | DATE | Date of observation |
| `observed_at` | TIMESTAMPTZ | Precise timestamp of observed event |
| `term` | TEXT | School term |
| `calendar_entry_id` | TEXT | Optional link to scheduled period |
| `observation_type` | TEXT (enum) | participation, academic, behavioral, attendance, extracurricular, test_result, other |
| `original_observation` | TEXT | **Teacher's exact wording — immutable source record** |
| `subject` | TEXT | Subject context |
| `activity_context` | TEXT | Activity context |
| `source_type` | TEXT (enum) | Voice transcription, Text note, Phone callback, Teacher chat |
| `capture_method` | TEXT (enum) | text, in_app_voice, basic_phone_callback, other |
| `possible_theme` | TEXT | Tentative theme (optional) |
| `verification_status` | TEXT (enum) | Pending, Needs more evidence, Repeated pattern, Verified by multiple teachers, Inconclusive |
| `submission_id` | TEXT (UNIQUE) | Idempotency key |
| `linked_test_id` | TEXT | FK to activity_tests (nullable) |
| `recording_reference` | TEXT | Audio reference |
| `transcript_text` | TEXT | Transcript (separate from original) |
| `transcription_provider` | TEXT | STT provider name |
| `transcription_status` | TEXT | STT status |
| `teacher_review_status` | TEXT (enum) | not_required, recorded, confirmed, updated |
| `reviewed_observation` | TEXT | Teacher-edited version |
| `reviewed_by_teacher_id` | TEXT | Reviewer FK |
| `reviewed_at` | TIMESTAMPTZ | Review timestamp |
| `created_at` | TIMESTAMPTZ | Persistence timestamp |

**Key Insight:** The `original_observation` field is the immutable factual record. The `teacher_review_status` and `reviewed_observation` provide a separate review lifecycle for voice-captured observations. The `verification_status` is evidence-oriented (not the same as the new evidence assessment status labels).

---

## 2. Distinguishing Factual Observations from Hypotheses

**Current State:**
- **Factual observations** = rows in `observations` table with `original_observation` containing teacher's exact words.
- **Hypotheses/Questions** = embedded in `activity_tests.suggested_activity` field. There is **no separate hypothesis table**.
- The `observations.possible_theme` field may capture a tentative theme but is not a structured hypothesis.

**Gap:** No explicit hypothesis/question entity exists. The evidence card must derive "questions explored" from `activity_tests.suggested_activity` and/or `observations.possible_theme`.

---

## 3. How Hypotheses Link to Observations

**Relationships (from `dataset_schema.sql`):**

```sql
-- Junction table: test ↔ supporting observations
CREATE TABLE activity_test_observations (
    test_id TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    observation_id TEXT NOT NULL,
    PRIMARY KEY (test_id, observation_id),
    FOREIGN KEY (test_id, learner_id) REFERENCES activity_tests(test_id, learner_id),
    FOREIGN KEY (observation_id, learner_id) REFERENCES observations(observation_id, learner_id)
);

-- Direct links on observations and tests
ALTER TABLE observations ADD CONSTRAINT observations_linked_test_same_learner_fk
    FOREIGN KEY (linked_test_id, learner_id) REFERENCES activity_tests(test_id, learner_id);

-- Test outcome link
CREATE TABLE activity_tests (
    ...
    outcome_observation_id TEXT,
    FOREIGN KEY (outcome_observation_id, learner_id) REFERENCES observations(observation_id, learner_id)
    CHECK (status <> 'Completed' OR outcome_observation_id IS NOT NULL)
);
```

**Link Types:**
1. **Supporting observations** → `activity_test_observations` (many-to-many)
2. **Outcome observation** → `activity_tests.outcome_observation_id` (one-to-one, required for Completed)
3. **Observation → test** → `observations.linked_test_id` (for test-result observations)

---

## 4. Suggested Tests Storage and Linkage

**Table:** `activity_tests`

| Field | Purpose |
|-------|---------|
| `test_id` | PK |
| `learner_id` | FK to learner |
| `suggested_activity` | **Contains the hypothesis/question being explored** |
| `activity_date` | When suggested/planned |
| `conducting_teacher_id` | Teacher FK |
| `observed_outcome` | Free-text outcome description (denormalized?) |
| `outcome_observation_id` | FK to outcome observation |
| `status` | Pending, In progress, Completed |

**Status Values:** `SUGGESTED`, `ACCEPTED`, `NOT_YET`, `REGENERATED`, `COMPLETED` (per DATA_MODEL.md — but schema shows `Pending`, `In progress`, `Completed` — **inconsistency to resolve**)

---

## 5. Test Selection, Completion, and Outcome Recording

| Action | Mechanism |
|--------|-----------|
| **Selection** | Teacher accepts test → status = `ACCEPTED`/`In progress` |
| **Completion** | Teacher records outcome observation with `linked_test_id` → test status = `Completed`, `outcome_observation_id` set |
| **Outcome** | Stored as observation with `observation_type = 'test_result'` and `linked_test_id` |

**Critical Constraint:** `CHECK (status <> 'Completed' OR outcome_observation_id IS NOT NULL)` ensures a test cannot be marked Completed without a linked outcome observation.

---

## 6. Outcome as Observation Linked to Test

**Yes.** Two mechanisms:
1. `observations.linked_test_id` → points to `activity_tests.test_id` (for test-result type observations)
2. `activity_tests.outcome_observation_id` → points to `observations.observation_id` (canonical outcome link)

Both enforce same-learner via composite FKs.

---

## 7. Learner Age Context

**Current Schema Gap:** The `learners` table has **no age, date of birth, or age-band field**.

**Available Proxies:**
- `classes.grade_level` (e.g., "Grade 3", "Year 5")
- `learner_enrollments.academic_year`
- `classes.stream_label`

**Gap:** No precise age. For evidence assessment, grade level is the only available proxy. This should be documented as a limitation.

---

## 8. Existing Evidence Summary Implementation

| Component | Status |
|-----------|--------|
| `lib/mcp-tools/draftPathwayNote.ts` | **Empty stub** (legacy filename) |
| `app/api/mcp/evidence-summary/route.ts` | Returns 501 NOT_IMPLEMENTED |
| `components/evidence/EvidenceOverview.tsx` | Empty stub |
| `components/evidence/ExploredQuestions.tsx` | Empty stub |
| `components/evidence/TestsConducted.tsx` | Empty stub |
| `components/evidence/ObservedOutcomes.tsx` | Empty stub |
| `components/evidence/EvidenceDisclaimer.tsx` | Empty stub |
| `app/(teacher)/evidence/[learnerId]/page.tsx` | **Hardcoded mock data only** |

**Conclusion:** **No reusable implementation exists.** The evidence card must be built from scratch, reusing only UI primitives (Card, Badge, Button) and data-access patterns from the learner record page.

---

## 9. Educational-Source Retrieval Adapter

**Status:** **Not implemented.**

From `INTEGRATIONS.md`:
> "Educational-source retrieval | Fast relevant lookup before every test suggestion | Separate retrieval/search adapter; not automatically MCP | Required behaviour; exact provider/adapter remains to be selected and tested"

**Available adapters in `lib/external-mcp/`:** `calendar.ts`, `sms.ts`, `stt.ts`, `voice.ts` — **no educational retrieval adapter**.

**Required:** Must create a new adapter (e.g., `lib/external-mcp/educational-retrieval.ts`) with:
- Configurable timeout (few seconds)
- Status tracking: `success`, `no_relevant_results`, `timeout`, `provider_error`, `not_configured`
- Source attribution (title, URL, excerpt)
- No learner PII in queries

---

## 10. Schema Gaps Preventing Evidence Card Implementation

| Gap | Impact | Resolution |
|-----|--------|------------|
| No explicit hypothesis/question table | "Questions explored" must be derived from `activity_tests.suggested_activity` | Acceptable — derive at query time |
| No learner age/DOB | Cannot provide precise age context to LLM | Document limitation; use grade_level as proxy |
| `activity_tests.status` enum mismatch | Schema: `Pending`/`In progress`/`Completed`; Docs: `SUGGESTED`/`ACCEPTED`/etc. | **Must align** — prefer documented states |
| No evidence assessment status field | Status labels (Supported, Inconclusive, etc.) are **ephemeral LLM outputs** — correctly NOT in schema | No schema change needed; generate on-demand |
| No educational-source retrieval persistence | Deferred per architecture — correct | No schema change needed |
| `teacher_reviews` table exists | Legacy pathway-note approval flow | **Deprecate/remove** — not part of MVP |
| Missing `retrieval_status` on `activity_tests` | Needed to track educational-source retrieval per suggestion | **Add column** (optional, nullable) |
| Missing `exploration_question` / `reason` / `purpose` / `what_to_observe` / `limitations` on `activity_tests` | DATA_MODEL.md specifies these; schema only has `suggested_activity` | **Add columns** to support full test suggestion spec |

---

## 11. Additional Findings

### UI Reference Design
- `docs/design/LearnerEvidenceCard.jpeg` exists — must match this design exactly.
- Single-column vertical layout, collapsed/expanded evidence rows, status badges, summary panel.

### MCP Tool Registry
- Dira MCP server (`lib/mcp-tools/dira-server.ts`) exposes: `log_observation`, `prepare_daily_follow_up_queue`, `list_due_follow_ups`, `dispatch_one_due_follow_up`.
- **Missing from MCP server:** `suggest_test`, `build_evidence_summary` (evidence-summary capability).
- The `evidence-summary` route exists but is not wired as an MCP tool.

### Model Integration
- `lib/models.ts` provides `createAgentCompletion()` for GLM-5.3 with tool-calling support.
- Temperature 0.2, 25s timeout, structured tool call parsing.

### Authentication
- `resolveTeacherContext()` returns demo teacher (first in DB) in non-production.
- Production returns null — evidence page shows "unavailable" message.

---

## 12. Recommended Schema Changes (Minimal)

```sql
-- 1. Align activity_tests status with documented states
ALTER TABLE activity_tests
    DROP CONSTRAINT activity_tests_status_check,
    ADD CONSTRAINT activity_tests_status_check
        CHECK (status IN ('SUGGESTED', 'ACCEPTED', 'NOT_YET', 'REGENERATED', 'COMPLETED'));

-- 2. Add missing test suggestion fields (per DATA_MODEL.md)
ALTER TABLE activity_tests
    ADD COLUMN IF NOT EXISTS exploration_question TEXT,
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS purpose TEXT,
    ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS what_to_observe TEXT[],
    ADD COLUMN IF NOT EXISTS what_to_log_after TEXT,
    ADD COLUMN IF NOT EXISTS limitations TEXT[],
    ADD COLUMN IF NOT EXISTS retrieval_status TEXT CHECK (retrieval_status IN ('success', 'no_relevant_results', 'timeout', 'provider_error', 'not_configured')),
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS supersedes_test_id TEXT REFERENCES activity_tests(test_id);

-- 3. Deprecate teacher_reviews and related tables (legacy pathway-note flow)
-- Do not drop yet — inspect callers first. Mark as deprecated in docs.
```

---

## 13. Next Steps

1. **Approve minimal schema changes** above.
2. **Create implementation plan** with phased approach:
   - Phase 1: Schema alignment + data access layer
   - Phase 2: Educational-source retrieval adapter (stubbed initially)
   - Phase 3: `build_evidence_summary` MCP tool + route
   - Phase 4: Evidence Card UI components (collapsed/expanded, status badges)
   - Phase 5: Evidence page integration + verification
3. **Document evidence-summary capability** in `docs/MCP_TOOLS.md`.
4. **Run verification tests** against synthetic data.

---

**Prepared by:** Kilo (Software Engineer)
**Date:** 2026-10-11
**Status:** Ready for review before implementation begins.