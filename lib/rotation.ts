
import { getPool } from "@/lib/db/client";

export const WEEKLY_ROTATION_SIZE = 10;

export interface RotationLearner {
  learner_id: string;
  display_name: string;
  class_id: string;
  school_id: string;
  academic_year: number;
  observation_count: number;
  last_observed_at: Date | null;
}

/**
 * Select up to 10 currently enrolled learners for observation.
 *
 * Priority:
 * 1. Learners with no observations.
 * 2. Learners whose most recent observation is oldest.
 * 3. Learner ID as a stable tie-breaker.
 */
export async function getWeeklyRotation(
  schoolId: string,
  limit = WEEKLY_ROTATION_SIZE,
): Promise<RotationLearner[]> {
  if (!schoolId?.trim()) {
    throw new Error("schoolId is required");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("limit must be an integer between 1 and 10");
  }

  const result = await getPool().query<RotationLearner>(
    `
    WITH enrolled_learners AS (
      SELECT DISTINCT
        l.learner_id,
        l.display_name,
        e.class_id,
        e.school_id,
        e.academic_year
      FROM learner_enrollments e
      JOIN learners l
        ON l.learner_id = e.learner_id
      WHERE e.school_id = $1
        AND e.enrolment_status <> 'Withdrawn'
        AND e.enrolled_from <= CURRENT_DATE
        AND (
          e.enrolled_to IS NULL
          OR e.enrolled_to >= CURRENT_DATE
        )
    ),
    observation_history AS (
      SELECT
        learner_id,
        class_id,
        school_id,
        academic_year,
        COUNT(*)::int AS observation_count,
        MAX(observed_at) AS last_observed_at
      FROM observations
      WHERE school_id = $1
      GROUP BY
        learner_id,
        class_id,
        school_id,
        academic_year
    )
    SELECT
      e.learner_id,
      e.display_name,
      e.class_id,
      e.school_id,
      e.academic_year,
      COALESCE(o.observation_count, 0)::int AS observation_count,
      o.last_observed_at
    FROM enrolled_learners e
    LEFT JOIN observation_history o
      ON o.learner_id = e.learner_id
     AND o.class_id = e.class_id
     AND o.school_id = e.school_id
     AND o.academic_year = e.academic_year
    ORDER BY
      o.last_observed_at ASC NULLS FIRST,
      e.learner_id ASC
    LIMIT $2
    `,
    [schoolId, limit],
  );

  return result.rows;
}
