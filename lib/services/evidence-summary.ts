import "server-only";
import { pool } from "@/lib/db/client";
import type { SuggestTestContext } from "@/lib/mcp-tools/suggestTest";

interface EvidenceObservation {
  observation_id: string;
  observation_type: string;
  original_observation: string;
  reviewed_observation: string | null;
  observed_at: Date;
  teacher_id: string;
  teacher_review_status: string;
  subject: string | null;
  activity_context: string | null;
}

interface EvidenceTest {
  test_id: string;
  status: "SUGGESTED" | "ACCEPTED" | "COMPLETED";
  exploration_question: string | null;
  hypothesis: string | null;
  suggested_activity: string;
  activity_date: string;
  purpose: string | null;
  estimated_minutes: number | null;
  what_to_observe: string[];
  what_to_log_after: string[];
  limitations: string[];
  retrieval_status: string;
  educational_sources: unknown;
  outcome_observation_id: string | null;
  observed_outcome: string | null;
  cited_observations: Array<{
    observation_id: string;
    observation_type: string;
    original_observation: string;
    reviewed_observation: string | null;
    observed_at: Date;
    teacher_id: string;
  }>;
}

export class EvidenceSummaryNotFoundError extends Error {
  constructor() {
    super("Learner is not currently assigned to this teacher");
    this.name = "EvidenceSummaryNotFoundError";
  }
}

export async function buildEvidenceSummary(
  learnerIdInput: string,
  context: SuggestTestContext,
) {
  const learnerId = learnerIdInput.trim();
  if (!learnerId || !context.teacher_id.trim() || !context.school_id.trim()) {
    throw new Error("A learner and trusted teacher/school context are required");
  }

  const learner = await pool.query<{
    learner_id: string;
    display_name: string;
    grade_level: string;
    stream_label: string;
    academic_year: number;
  }>(
    `SELECT l.learner_id, l.display_name, c.grade_level, c.stream_label,
            e.academic_year
     FROM learners l
     JOIN learner_enrollments e ON e.learner_id = l.learner_id
     JOIN classes c
       ON c.class_id = e.class_id
      AND c.school_id = e.school_id
      AND c.academic_year = e.academic_year
     WHERE l.learner_id = $1
       AND e.school_id = $2
       AND e.enrolment_status <> 'Withdrawn'
       AND e.enrolled_from <= CURRENT_DATE
       AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)
       AND EXISTS (
         SELECT 1
         FROM timetable_assignments ta
         WHERE ta.class_id = e.class_id
           AND ta.school_id = e.school_id
           AND ta.academic_year = e.academic_year
           AND ta.teacher_id = $3
           AND ta.valid_from <= CURRENT_DATE
           AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
       )
     ORDER BY e.academic_year DESC
     LIMIT 1`,
    [learnerId, context.school_id, context.teacher_id],
  );
  const learnerRecord = learner.rows[0];
  if (!learnerRecord) {
    throw new EvidenceSummaryNotFoundError();
  }

  const observations = await pool.query<EvidenceObservation>(
    `SELECT o.observation_id, o.observation_type, o.original_observation,
            o.reviewed_observation, o.observed_at, o.teacher_id,
            o.teacher_review_status, o.subject, o.activity_context
     FROM observations o
     WHERE o.learner_id = $1
       AND o.school_id = $2
       AND EXISTS (
         SELECT 1
         FROM learner_enrollments e
         JOIN timetable_assignments ta
           ON ta.class_id = e.class_id
          AND ta.school_id = e.school_id
          AND ta.academic_year = e.academic_year
         WHERE e.learner_id = o.learner_id
           AND e.class_id = o.class_id
           AND e.academic_year = o.academic_year
           AND ta.teacher_id = $3
           AND ta.valid_from <= CURRENT_DATE
           AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
       )
     ORDER BY o.observed_at DESC, o.observation_id`,
    [learnerId, context.school_id, context.teacher_id],
  );

  const tests = await pool.query<EvidenceTest>(
    `SELECT t.test_id, t.status, t.exploration_question, t.hypothesis,
            t.suggested_activity, t.activity_date::text AS activity_date,
            t.purpose, t.estimated_minutes, t.what_to_observe,
            t.what_to_log_after, t.limitations, t.retrieval_status,
            t.suggestion_payload->'educational_sources' AS educational_sources,
            outcome.observation_id AS outcome_observation_id,
            outcome.original_observation AS observed_outcome,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'observation_id', evidence.observation_id,
                  'observation_type', evidence.observation_type,
                  'original_observation', evidence.original_observation,
                  'reviewed_observation', evidence.reviewed_observation,
                  'observed_at', evidence.observed_at,
                  'teacher_id', evidence.teacher_id
                )
                ORDER BY evidence.observed_at
              ) FILTER (WHERE evidence.observation_id IS NOT NULL),
              '[]'::jsonb
            ) AS cited_observations
     FROM activity_tests t
     LEFT JOIN observations outcome
       ON outcome.observation_id = t.outcome_observation_id
     LEFT JOIN activity_test_observations ato
       ON ato.test_id = t.test_id AND ato.learner_id = t.learner_id
     LEFT JOIN observations evidence
       ON evidence.observation_id = ato.observation_id
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
     GROUP BY t.test_id, outcome.observation_id
     ORDER BY t.activity_date DESC, t.test_id`,
    [learnerId, context.school_id, context.teacher_id],
  );

  return {
    learner: learnerRecord,
    observations: observations.rows,
    tests: tests.rows,
    test_count: tests.rowCount ?? 0,
  };
}
