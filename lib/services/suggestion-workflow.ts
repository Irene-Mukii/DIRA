import "server-only";

import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db/client";
import type {
  SuggestTestContext,
  SuggestTestResult,
  SuggestionObservation,
  PriorTestRow,
} from "@/lib/mcp-tools/suggestTest";
import { SuggestionPersistenceError } from "@/lib/mcp-tools/suggestTest";

export interface LearnerSuggestionContext {
  grade_level: string;
  stream_label: string;
  observations: SuggestionObservation[];
}

export interface PreviousSuggestion {
  test_id: string;
  suggested_activity: string;
  activity_date: string;
  status: PriorTestRow["status"];
  evidence_ids: string[];
  exploration_question: string | null;
  reason: string | null;
  rejection_reason: string | null;
}

const REVIEWED_STATUSES = ["not_required", "confirmed", "updated"];

export async function loadLearnerSuggestionContext(
  learnerId: string,
  context: SuggestTestContext,
): Promise<LearnerSuggestionContext> {
  const teacher = await pool.query(
    `SELECT 1 FROM teachers WHERE teacher_id = $1 AND school_id = $2 LIMIT 1`,
    [context.teacher_id, context.school_id],
  );
  if (!teacher.rowCount) {
    throw new SuggestionPersistenceError(
      "The trusted teacher is not authorized for the selected school.",
      403,
    );
  }

  const assignment = await pool.query<{
    grade_level: string;
    stream_label: string;
  }>(
    `SELECT c.grade_level, c.stream_label
     FROM learner_enrollments e
     JOIN classes c
       ON c.class_id = e.class_id
      AND c.school_id = e.school_id
      AND c.academic_year = e.academic_year
     JOIN timetable_assignments ta
       ON ta.class_id = e.class_id
      AND ta.school_id = e.school_id
      AND ta.academic_year = e.academic_year
     WHERE e.learner_id = $1
       AND e.school_id = $2
       AND e.enrolment_status <> 'Withdrawn'
       AND e.enrolled_from <= CURRENT_DATE
       AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)
       AND ta.teacher_id = $3
       AND ta.valid_from <= CURRENT_DATE
       AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
     ORDER BY c.grade_level, c.stream_label
     LIMIT 1`,
    [learnerId, context.school_id, context.teacher_id],
  );
  const learnerClass = assignment.rows[0];
  if (!learnerClass) {
    throw new SuggestionPersistenceError(
      "The learner is not in a currently assigned class for this teacher.",
      404,
    );
  }

  const observations = await pool.query<SuggestionObservation>(
    `SELECT observation_id, learner_id, teacher_id, observation_type,
            original_observation, reviewed_observation, observed_at,
            observation_date::text AS observation_date, activity_context,
            subject, term, possible_theme, teacher_review_status
     FROM observations
     WHERE learner_id = $1 AND school_id = $2
       AND EXISTS (
         SELECT 1
         FROM learner_enrollments e
         JOIN timetable_assignments ta
           ON ta.class_id = e.class_id
          AND ta.school_id = e.school_id
          AND ta.academic_year = e.academic_year
         WHERE e.learner_id = observations.learner_id
           AND e.class_id = observations.class_id
           AND e.academic_year = observations.academic_year
           AND ta.teacher_id = $3
           AND ta.valid_from <= CURRENT_DATE
           AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
       )
     ORDER BY observed_at ASC, observation_id ASC`,
    [learnerId, context.school_id, context.teacher_id],
  );

  return {
    ...learnerClass,
    observations: observations.rows,
  };
}

export async function loadPreviousSuggestions(
  learnerId: string,
  context: SuggestTestContext,
): Promise<PreviousSuggestion[]> {
  const result = await pool.query<{
    test_id: string;
    suggested_activity: string;
    activity_date: string;
    status: PriorTestRow["status"];
    evidence_ids: string[];
    suggestion_payload: {
      exploration_question?: string;
      reason?: string;
      rejection_reason?: string;
    } | null;
  }>(
    `SELECT t.test_id, t.suggested_activity, t.activity_date::text,
            t.status,
            COALESCE(
              array_agg(ato.observation_id)
                FILTER (WHERE ato.observation_id IS NOT NULL),
              ARRAY[]::text[]
            ) AS evidence_ids,
            t.suggestion_payload
     FROM activity_tests t
     LEFT JOIN activity_test_observations ato
       ON ato.test_id = t.test_id AND ato.learner_id = t.learner_id
     WHERE t.learner_id = $1
       AND EXISTS (
         SELECT 1
         FROM learner_enrollments e
         JOIN timetable_assignments ta
           ON ta.class_id = e.class_id
          AND ta.school_id = e.school_id
          AND ta.academic_year = e.academic_year
         WHERE e.learner_id = t.learner_id
           AND e.school_id = $2
           AND ta.teacher_id = $3
           AND ta.valid_from <= CURRENT_DATE
           AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
       )
     GROUP BY t.test_id
     ORDER BY t.activity_date DESC, t.test_id DESC
     LIMIT 20`,
    [learnerId, context.school_id, context.teacher_id],
  );

  return result.rows.map((row) => ({
    test_id: row.test_id,
    suggested_activity: row.suggested_activity,
    activity_date: row.activity_date,
    status: row.status,
    evidence_ids: row.evidence_ids,
    exploration_question: row.suggestion_payload?.exploration_question ?? null,
    reason: row.suggestion_payload?.reason ?? null,
    rejection_reason: row.suggestion_payload?.rejection_reason ?? null,
  }));
}

export async function persistSuggestedProposal(
  suggestion: Extract<SuggestTestResult, { ok: true }>,
  submissionId: string,
  context: SuggestTestContext,
  supersedesTestId?: string,
): Promise<{ suggestion: Extract<SuggestTestResult, { ok: true }>; duplicate: boolean }> {
  if (!submissionId.trim() || submissionId.length > 200) {
    throw new SuggestionPersistenceError("A valid submission_id is required", 400);
  }
  if (
    !suggestion.proposal_id ||
    suggestion.learner_id.trim() === "" ||
    suggestion.cited_observations.length === 0
  ) {
    throw new SuggestionPersistenceError("The generated proposal is incomplete", 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{
      test_id: string;
      learner_id: string;
      conducting_teacher_id: string;
      suggestion_payload: Extract<SuggestTestResult, { ok: true }>;
    }>(
      `SELECT test_id, learner_id, conducting_teacher_id, suggestion_payload
       FROM activity_tests
       WHERE approval_submission_id = $1
       FOR SHARE`,
      [submissionId],
    );
    if (existing.rows[0]) {
      const saved = existing.rows[0];
      if (
        saved.learner_id !== suggestion.learner_id ||
        saved.conducting_teacher_id !== context.teacher_id
      ) {
        throw new SuggestionPersistenceError(
          "submission_id was already used for a different suggestion",
          409,
        );
      }
      await client.query("COMMIT");
      return {
        suggestion: { ...saved.suggestion_payload, test_id: saved.test_id },
        duplicate: true,
      };
    }

    const teacher = await client.query(
      `SELECT 1 FROM teachers WHERE teacher_id = $1 AND school_id = $2`,
      [context.teacher_id, context.school_id],
    );
    if (!teacher.rowCount) {
      throw new SuggestionPersistenceError(
        "Teacher is not registered for this school",
        403,
      );
    }

    const enrollment = await client.query(
      `SELECT 1
       FROM learner_enrollments e
       WHERE e.learner_id = $1 AND e.school_id = $2
         AND e.enrolment_status <> 'Withdrawn'
         AND e.enrolled_from <= CURRENT_DATE
         AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)
         AND EXISTS (
           SELECT 1 FROM timetable_assignments ta
           WHERE ta.class_id = e.class_id
             AND ta.school_id = e.school_id
             AND ta.academic_year = e.academic_year
             AND ta.teacher_id = $3
             AND ta.valid_from <= CURRENT_DATE
             AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
         )
       LIMIT 1 FOR SHARE`,
      [suggestion.learner_id, context.school_id, context.teacher_id],
    );
    if (!enrollment.rowCount) {
      throw new SuggestionPersistenceError(
        "The learner is not in a currently assigned class for this teacher.",
        404,
      );
    }

    const evidenceIds = [
      ...new Set(suggestion.cited_observations.map((item) => item.observation_id)),
    ];
    const evidence = await client.query<{ observation_id: string }>(
      `SELECT observation_id
       FROM observations
       WHERE observation_id = ANY($1::text[])
         AND learner_id = $2
         AND school_id = $3
         AND teacher_review_status = ANY($4::text[])
       FOR SHARE`,
      [evidenceIds, suggestion.learner_id, context.school_id, REVIEWED_STATUSES],
    );
    if (evidence.rowCount !== evidenceIds.length) {
      throw new SuggestionPersistenceError(
        "One or more cited observations are no longer eligible evidence",
        409,
      );
    }

    if (supersedesTestId) {
      const superseded = await client.query(
        `SELECT 1
         FROM activity_tests
         WHERE test_id = $1
           AND learner_id = $2
           AND conducting_teacher_id = $3
           AND status = 'SUGGESTED'
         FOR SHARE`,
        [supersedesTestId, suggestion.learner_id, context.teacher_id],
      );
      if (!superseded.rowCount) {
        throw new SuggestionPersistenceError(
          "The replaced suggestion is unavailable or not eligible",
          409,
        );
      }
    }

    const testId = `TEST-${randomUUID()}`;
    const activity = suggestion.suggested_activity;
    const inserted = await client.query<{ test_id: string }>(
      `INSERT INTO activity_tests (
         test_id, learner_id, suggested_activity, activity_date,
         conducting_teacher_id, status, supersedes_test_id,
         approval_submission_id, suggestion_payload, exploration_question,
         hypothesis, reason, purpose, estimated_minutes, what_to_observe,
         what_to_log_after, limitations, retrieval_status
       )
       VALUES ($1, $2, $3, CURRENT_DATE, $4, 'SUGGESTED', $5, $6,
               $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT DO NOTHING
       RETURNING test_id`,
      [
        testId,
        suggestion.learner_id,
        [
          activity.title,
          `Purpose: ${activity.purpose}`,
          "Steps:",
          ...activity.steps.map((step) => `- ${step}`),
          ...(activity.intended_outcome
            ? [`Intended outcome: ${activity.intended_outcome}`]
            : []),
          "What to observe:",
          ...activity.what_to_observe.map((item) => `- ${item}`),
          ...(activity.assessment_criteria?.length
            ? [
                "Assessment criteria:",
                ...activity.assessment_criteria.map((item) => `- ${item}`),
              ]
            : []),
        ].join("\n"),
        context.teacher_id,
        supersedesTestId ?? null,
        submissionId,
        JSON.stringify(suggestion),
        suggestion.exploration_question,
        suggestion.hypothesis,
        suggestion.reason,
        activity.purpose,
        activity.duration_minutes,
        activity.what_to_observe,
        suggestion.what_to_log_afterward,
        suggestion.limitations,
        suggestion.retrieval_status ?? "failed",
      ],
    );
    if (!inserted.rows[0]) {
      const raced = await client.query<{
        test_id: string;
        learner_id: string;
        conducting_teacher_id: string;
        suggestion_payload: Extract<SuggestTestResult, { ok: true }>;
      }>(
        `SELECT test_id, learner_id, conducting_teacher_id, suggestion_payload
         FROM activity_tests
         WHERE approval_submission_id = $1
         FOR SHARE`,
        [submissionId],
      );
      const saved = raced.rows[0];
      if (
        !saved ||
        saved.learner_id !== suggestion.learner_id ||
        saved.conducting_teacher_id !== context.teacher_id
      ) {
        throw new SuggestionPersistenceError(
          "submission_id was already used for a different suggestion",
          409,
        );
      }
      await client.query("COMMIT");
      return {
        suggestion: { ...saved.suggestion_payload, test_id: saved.test_id },
        duplicate: true,
      };
    }

    await client.query(
      `INSERT INTO activity_test_observations (
         test_id, learner_id, observation_id, citation_role
       )
       SELECT $1, $2, evidence_id, 'context'
       FROM unnest($3::text[]) AS evidence_id
       ON CONFLICT DO NOTHING`,
      [testId, suggestion.learner_id, evidenceIds],
    );
    await client.query("COMMIT");
    return {
      suggestion: { ...suggestion, test_id: testId },
      duplicate: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadStoredProposal(
  learnerId: string,
  proposalId: string,
  context: SuggestTestContext,
): Promise<{
  test_id: string;
  status: "SUGGESTED" | "ACCEPTED" | "COMPLETED";
  suggestion: Extract<SuggestTestResult, { ok: true }>;
} | null> {
  const result = await pool.query<{
    test_id: string;
    status: "SUGGESTED" | "ACCEPTED" | "COMPLETED";
    suggestion_payload: Extract<SuggestTestResult, { ok: true }>;
  }>(
    `SELECT t.test_id, t.status, t.suggestion_payload
     FROM activity_tests t
     WHERE t.learner_id = $1
       AND t.conducting_teacher_id = $2
       AND t.suggestion_payload->>'proposal_id' = $3
       AND EXISTS (
         SELECT 1
         FROM learner_enrollments e
         JOIN timetable_assignments ta
           ON ta.class_id = e.class_id
          AND ta.school_id = e.school_id
          AND ta.academic_year = e.academic_year
         WHERE e.learner_id = t.learner_id
           AND e.school_id = $4
           AND ta.teacher_id = $2
           AND ta.valid_from <= CURRENT_DATE
           AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
       )
     ORDER BY t.activity_date DESC
     LIMIT 1`,
    [learnerId, context.teacher_id, proposalId, context.school_id],
  );
  const row = result.rows[0];
  return row
    ? {
        test_id: row.test_id,
        status: row.status,
        suggestion: { ...row.suggestion_payload, test_id: row.test_id },
      }
    : null;
}

export async function regenerateSuggestion(
  input: {
    learner_id: string;
    submission_id: string;
    proposal_id: string;
    supersedes_test_id?: string;
  },
  context: SuggestTestContext,
): Promise<{
  rejected_test_id: string;
  learner_id: string;
  status: "SUGGESTED";
  suggestion: SuggestTestResult;
  duplicate: boolean;
}> {
  const learnerId = input.learner_id.trim();
  const submissionId = input.submission_id.trim();
  if (!learnerId || !submissionId || submissionId.length > 200) {
    throw new SuggestionPersistenceError(
      "learner_id and a valid submission_id are required",
      400,
    );
  }
  const previous = await loadStoredProposal(
    learnerId,
    input.proposal_id,
    context,
  );
  if (!previous || previous.status !== "SUGGESTED") {
    throw new SuggestionPersistenceError(
      "The suggestion is unavailable or no longer eligible for regeneration",
      409,
    );
  }
  if (
    input.supersedes_test_id &&
    input.supersedes_test_id !== previous.test_id
  ) {
    throw new SuggestionPersistenceError(
      "The replaced suggestion does not match the proposal",
      409,
    );
  }

  const { suggestTest } = await import("@/lib/mcp-tools/suggestTest");
  const suggestion = await suggestTest(learnerId, context, {
    submission_id: submissionId,
    supersedes_test_id: previous.test_id,
  });
  return {
    rejected_test_id: previous.test_id,
    learner_id: learnerId,
    status: "SUGGESTED",
    duplicate: suggestion.ok && suggestion.duplicate === true,
    suggestion,
  };
}

export interface AcceptSuggestionInput {
  learner_id: string;
  submission_id: string;
  planned_date: string;
  proposal_id: string;
  supersedes_test_id?: string;
}

export interface AcceptedSuggestionResult {
  test_id: string;
  learner_id: string;
  status: "ACCEPTED";
  activity_date: string;
  duplicate: boolean;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

export async function acceptSuggestion(
  input: AcceptSuggestionInput,
  context: SuggestTestContext,
): Promise<AcceptedSuggestionResult> {
  const learnerId = input.learner_id.trim();
  const submissionId = input.submission_id.trim();
  const plannedDate = input.planned_date.trim();
  if (!learnerId || !context.teacher_id.trim() || !context.school_id.trim()) {
    throw new SuggestionPersistenceError(
      "learner_id and trusted teacher/school context are required",
      400,
    );
  }
  if (!submissionId || submissionId.length > 200) {
    throw new SuggestionPersistenceError("A valid submission_id is required", 400);
  }
  if (!isDateOnly(plannedDate)) {
    throw new SuggestionPersistenceError(
      "planned_date must be a valid YYYY-MM-DD date",
      400,
    );
  }

  const alreadyAccepted = await pool.query<{
    test_id: string;
    learner_id: string;
    activity_date: string;
    proposal_id: string;
  }>(
    `SELECT test_id, learner_id, activity_date::text,
            suggestion_payload->>'proposal_id' AS proposal_id
     FROM activity_tests
     WHERE suggestion_payload->>'acceptance_submission_id' = $1
       AND learner_id = $2
       AND conducting_teacher_id = $3
     LIMIT 1`,
    [submissionId, learnerId, context.teacher_id],
  );
  const existingAcceptance = alreadyAccepted.rows[0];
  if (existingAcceptance) {
    if (
      existingAcceptance.proposal_id !== input.proposal_id ||
      existingAcceptance.activity_date !== plannedDate
    ) {
      throw new SuggestionPersistenceError(
        "submission_id was already used for a different acceptance",
        409,
      );
    }
    return {
      test_id: existingAcceptance.test_id,
      learner_id: learnerId,
      status: "ACCEPTED",
      activity_date: plannedDate,
      duplicate: true,
    };
  }

  const proposal = await loadStoredProposal(
    learnerId,
    input.proposal_id,
    context,
  );
  if (!proposal || proposal.status !== "SUGGESTED") {
    throw new SuggestionPersistenceError(
      "The proposal is unavailable or is no longer awaiting a teacher decision",
      409,
    );
  }

  const evidenceIds = [
    ...new Set(proposal.suggestion.cited_observations.map((item) => item.observation_id)),
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const teacher = await client.query(
      `SELECT 1 FROM teachers WHERE teacher_id = $1 AND school_id = $2`,
      [context.teacher_id, context.school_id],
    );
    if (!teacher.rowCount) {
      throw new SuggestionPersistenceError(
        "Teacher is not registered for this school",
        403,
      );
    }

    const enrollment = await client.query(
      `SELECT 1 FROM learner_enrollments
       WHERE learner_id = $1 AND school_id = $2
         AND enrolled_from <= $3::date
         AND (enrolled_to IS NULL OR enrolled_to >= $3::date)
         AND EXISTS (
           SELECT 1
           FROM timetable_assignments ta
           WHERE ta.class_id = learner_enrollments.class_id
             AND ta.school_id = learner_enrollments.school_id
             AND ta.academic_year = learner_enrollments.academic_year
             AND ta.teacher_id = $4
             AND ta.valid_from <= $3::date
             AND (ta.valid_to IS NULL OR ta.valid_to >= $3::date)
         )
       LIMIT 1 FOR SHARE`,
      [learnerId, context.school_id, plannedDate, context.teacher_id],
    );
    if (!enrollment.rowCount) {
      throw new SuggestionPersistenceError(
        "Learner is not in a teacher-assigned class on the planned activity date",
        404,
      );
    }

    if (input.supersedes_test_id) {
      const superseded = await client.query(
        `SELECT 1
         FROM activity_tests
         WHERE test_id = $1
           AND learner_id = $2
           AND conducting_teacher_id = $3
           AND status = 'SUGGESTED'
         FOR SHARE`,
        [input.supersedes_test_id, learnerId, context.teacher_id],
      );
      if (!superseded.rowCount) {
        throw new SuggestionPersistenceError(
          "The replaced suggestion is unavailable or not eligible",
          409,
        );
      }
    }

    const currentEvidence = await client.query<{ observation_id: string }>(
      `SELECT observation_id
       FROM observations
       WHERE observation_id = ANY($1::text[])
         AND learner_id = $2
         AND school_id = $3
         AND teacher_review_status = ANY($4::text[])
       FOR SHARE`,
      [evidenceIds, learnerId, context.school_id, REVIEWED_STATUSES],
    );
    if (currentEvidence.rowCount !== evidenceIds.length) {
      throw new SuggestionPersistenceError(
        "One or more cited observations are no longer eligible evidence",
        409,
      );
    }

    const saved = await client.query(
      `UPDATE activity_tests
       SET status = 'ACCEPTED',
           activity_date = $2::date,
           accepted_at = NOW(),
           suggestion_payload = suggestion_payload ||
             jsonb_build_object('acceptance_submission_id', $3::text)
       WHERE test_id = $1
         AND learner_id = $4
         AND conducting_teacher_id = $5
         AND status = 'SUGGESTED'
       RETURNING test_id`,
      [
        proposal.test_id,
        plannedDate,
        submissionId,
        learnerId,
        context.teacher_id,
      ],
    );
    if (!saved.rowCount) {
      throw new SuggestionPersistenceError(
        "The proposal changed while it was being accepted",
        409,
      );
    }
    await client.query("COMMIT");
    return {
      test_id: proposal.test_id,
      learner_id: learnerId,
      status: "ACCEPTED",
      activity_date: plannedDate,
      duplicate: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
