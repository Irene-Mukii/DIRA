import Link from "next/link";
import { connection } from "next/server";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { pool } from "@/lib/db/client";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";

interface LearnerListRecord {
  learner_id: string;
  display_name: string;
  grade_level: string;
  stream_label: string;
  academic_year: number;
  observation_count: number;
  last_observed_at: Date | null;
}

function formatLastObserved(value: Date | null): string {
  return value ? new Date(value).toLocaleDateString() : "Not observed yet";
}

export default async function LearnersPage() {
  await connection();

  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE !== "true"
  ) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learners unavailable</h1>
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
          <h1 className="text-xl font-semibold">Learners unavailable</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Add a teacher record before viewing the single-teacher demo.
          </p>
        </Card>
      );
    }

    const result = await pool.query<LearnerListRecord>(
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
       ORDER BY c.grade_level, c.stream_label, l.display_name`,
      [context.school_id],
    );

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Learners</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Select an enrolled learner to view their record or log an observation.
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
                    <Badge variant={learner.observation_count > 0 ? "secondary" : "default"}>
                      {learner.observation_count > 0 ? "Recent" : "Needs observation"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1">
                      <Link href={`/learners/${encodeURIComponent(learner.learner_id)}`}>
                        View
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline-solid" className="flex-1">
                      <Link href={`/learners/${encodeURIComponent(learner.learner_id)}/log-observation`}>
                        Observe
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
    console.error("Failed to load learners:", error);
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learners unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Could not load learners from PostgreSQL. Verify the database is healthy, initialized, and seeded.
        </p>
      </Card>
    );
  }
}
