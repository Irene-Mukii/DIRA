import { connection } from "next/server";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { pool } from "@/lib/db/client";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";

interface ThisWeekLearner {
  learner_id: string;
  display_name: string;
  grade_level: string;
  stream_label: string;
  academic_year: number;
  last_observed_at: Date | null;
  observation_count: number;
}

function formatLastObserved(value: Date | null): string {
  return value ? new Date(value).toLocaleDateString() : "No observations recorded yet";
}

export default async function ThisWeekPage() {
  await connection();

  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE !== "true"
  ) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">This Week unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Weekly focus list requires an authenticated teacher session, which is not configured.
        </p>
      </Card>
    );
  }

  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return (
        <Card className="p-6">
          <h1 className="text-xl font-semibold">This Week unavailable</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Add a teacher record before viewing the single-teacher demo.
          </p>
        </Card>
      );
    }

    const result = await pool.query<ThisWeekLearner>(
      `SELECT
         l.learner_id,
         l.display_name,
         c.grade_level,
         c.stream_label,
         e.academic_year,
         COUNT(o.observation_id)::int AS observation_count,
         MAX(o.observed_at) AS last_observed_at
       FROM learners l
       JOIN learner_enrollments e ON e.learner_id = l.learner_id
       JOIN classes c
         ON c.class_id = e.class_id
        AND c.school_id = e.school_id
        AND c.academic_year = e.academic_year
       LEFT JOIN observations o
         ON o.learner_id = l.learner_id
        AND o.class_id = e.class_id
        AND o.academic_year = e.academic_year
       WHERE e.school_id = $1
         AND e.enrolment_status <> 'Withdrawn'
         AND e.enrolled_from <= CURRENT_DATE
         AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)
       GROUP BY
         l.learner_id,
         l.display_name,
         c.grade_level,
         c.stream_label,
         e.academic_year
       ORDER BY
         CASE WHEN MAX(o.observed_at) IS NULL THEN 0 ELSE 1 END,
         MAX(o.observed_at) ASC NULLS FIRST,
         l.display_name
       LIMIT 10`,
      [context.school_id],
    );

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">This Week</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            This week, keep an eye out for these learners. You do not need to do anything differently—just notice what you normally notice.
          </p>
        </div>

        {result.rows.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No currently enrolled learners were found for this teacher&apos;s school. Check that the
              development dataset has been imported.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {result.rows.map((learner) => (
              <Card key={`${learner.learner_id}-${learner.academic_year}`} className="p-6">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {learner.display_name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {learner.grade_level} · Stream {learner.stream_label} · {learner.academic_year}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Learner ID: {learner.learner_id}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Last observed</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {formatLastObserved(learner.last_observed_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1">
                      <Link href={`/learners/${encodeURIComponent(learner.learner_id)}`}>
                        View Record
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline-solid" className="flex-1">
                      <Link href={`/learners/${encodeURIComponent(learner.learner_id)}/log-observation`}>
                        Log Observation
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Failed to load this week learners:", error);
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">This Week unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Could not load learners from PostgreSQL. Verify the database is healthy, initialized, and seeded.
        </p>
      </Card>
    );
  }
}