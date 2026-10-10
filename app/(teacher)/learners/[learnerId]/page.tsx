import Link from "next/link";
import { connection } from "next/server";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ObservationReviewControls from "@/components/observations/ObservationReviewControls";
import { pool } from "@/lib/db/client";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";

interface LearnerProfile {
  learner_id: string;
  display_name: string;
  class_id: string;
  grade_level: string;
  stream_label: string;
  academic_year: number;
  observation_count: number;
  last_observed_at: Date | null;
  tests_suggested: number;
}

interface ObservationRow {
  observation_id: string;
  original_observation: string;
  reviewed_observation: string | null;
  observation_type: string;
  observed_at: Date;
  linked_test_id: string | null;
  teacher_review_status: "not_required" | "recorded" | "confirmed" | "updated";
}

interface SuggestedTest {
  test_id: string;
  suggested_activity: string;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "Not observed yet";
  return new Date(value).toLocaleDateString();
}

export default async function LearnerDetailPage({
  params,
}: {
  params: Promise<{ learnerId: string }>;
}) {
  await connection();
  const { learnerId } = await params;

  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE !== "true"
  ) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learner record unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Learner records require an authenticated teacher session, which is not configured.
        </p>
      </Card>
    );
  }

  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return (
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Learner record unavailable</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Add a teacher record before viewing the single-teacher demo.
          </p>
        </Card>
      );
    }
    const schoolId = context.school_id;

    const profileResult = await pool.query<LearnerProfile>(
      `SELECT
         l.learner_id,
         l.display_name,
         e.class_id,
         c.grade_level,
         c.stream_label,
         e.academic_year,
         (
           SELECT COUNT(*)::int
           FROM observations o
           WHERE o.learner_id = l.learner_id
             AND o.class_id = e.class_id
             AND o.academic_year = e.academic_year
         ) AS observation_count,
         (
           SELECT MAX(o.observed_at)
           FROM observations o
           WHERE o.learner_id = l.learner_id
             AND o.class_id = e.class_id
             AND o.academic_year = e.academic_year
         ) AS last_observed_at,
         (
           SELECT COUNT(*)::int
           FROM activity_tests t
           WHERE t.learner_id = l.learner_id
         ) AS tests_suggested
       FROM learners l
       JOIN learner_enrollments e ON e.learner_id = l.learner_id
       JOIN classes c
         ON c.class_id = e.class_id
        AND c.school_id = e.school_id
        AND c.academic_year = e.academic_year
       WHERE l.learner_id = $1 AND e.school_id = $2
       ORDER BY e.academic_year DESC
       LIMIT 1`,
      [learnerId, schoolId],
    );
    const learner = profileResult.rows[0];

    if (!learner) {
      return (
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Learner not found</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            This learner is not enrolled in the configured development school.
          </p>
        </Card>
      );
    }

    const observationsResult = await pool.query<ObservationRow>(
      `SELECT observation_id, original_observation, reviewed_observation,
              observation_type, observed_at, linked_test_id, teacher_review_status
       FROM observations
       WHERE learner_id = $1 AND class_id = $2 AND academic_year = $3
       ORDER BY observed_at DESC
       LIMIT 10`,
      [learnerId, learner.class_id, learner.academic_year],
    );
    const testsResult = await pool.query<SuggestedTest>(
      `SELECT test_id, suggested_activity
       FROM activity_tests
       WHERE learner_id = $1 AND status IN ('Pending', 'In progress')
       ORDER BY activity_date DESC`,
      [learnerId],
    );

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {learner.display_name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {learner.grade_level} · Stream {learner.stream_label} · {learner.academic_year}
            </p>
          </div>
          <Button>
            <Link href={`/learners/${encodeURIComponent(learner.learner_id)}/log-observation`}>
              Log Observation
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="p-4">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Observations</h2>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{learner.observation_count}</p>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Observed</h2>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatDate(learner.last_observed_at)}
            </p>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Tests Suggested</h2>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{learner.tests_suggested}</p>
          </Card>
        </div>

        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recent Observations
          </h2>
          {observationsResult.rows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No observations have been recorded.</p>
          ) : (
            <div className="space-y-3">
              {observationsResult.rows.map((observation) => (
                <div
                  key={observation.observation_id}
                  className="flex items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700"
                >
                  <div>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {observation.reviewed_observation ?? observation.original_observation}
                    </p>
                    <p className="mt-1 text-xs capitalize text-gray-500 dark:text-gray-400">
                      {formatDate(observation.observed_at)} · {observation.observation_type}
                    </p>
                  </div>
                  <ObservationReviewControls
                    observation={observation}
                    tests={testsResult.rows}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  } catch (error) {
    console.error("Failed to load learner profile:", error);
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learner record unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          The learner record could not be loaded. Verify the development database is running and initialized.
        </p>
      </Card>
    );
  }
}
