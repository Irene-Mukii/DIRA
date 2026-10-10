import Link from "next/link";
import { connection } from "next/server";
import Card from "@/components/ui/Card";
import ObservationChat from "@/components/observations/ObservationChat";
import { pool } from "@/lib/db/client";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";

interface LearnerForObservation {
  learner_id: string;
  display_name: string;
  grade_level: string;
  stream_label: string;
  academic_year: number;
}

function unavailable(message: string, learnerId: string) {
  return (
    <Card className="m-4 p-6">
      <h1 className="text-xl font-semibold">Observation log unavailable</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p>
      <Link
        href={`/learners/${encodeURIComponent(learnerId)}`}
        className="mt-4 inline-flex text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
      >
        Back to learner record
      </Link>
    </Card>
  );
}

export default async function LogObservationPage({
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
    return unavailable(
      "Observation logging requires an authenticated teacher session, which is not configured.",
      learnerId,
    );
  }

  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return unavailable("Add a teacher record before logging observations.", learnerId);
    }

    const result = await pool.query<LearnerForObservation>(
      `SELECT
         l.learner_id,
         l.display_name,
         c.grade_level,
         c.stream_label,
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
       ORDER BY e.academic_year DESC
       LIMIT 1`,
      [learnerId, context.school_id],
    );
    const learner = result.rows[0];

    if (!learner) {
      return unavailable(
        "This learner is not currently enrolled in the configured development school. Return to Learners and select one of the listed records.",
        learnerId,
      );
    }

    return (
      <div className="flex h-full flex-col px-4 md:px-6">
        <div className="border-b border-gray-200 bg-white py-4 dark:border-gray-700 dark:bg-gray-800">
          <Link
            href={`/learners/${encodeURIComponent(learner.learner_id)}`}
            className="mb-3 inline-flex text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            ← Back to Learner Record
          </Link>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                {learner.display_name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {learner.display_name}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {learner.grade_level} · Stream {learner.stream_label} · {learner.academic_year}
                </p>
              </div>
            </div>
            <Link
              href={`/learners/${encodeURIComponent(learner.learner_id)}`}
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              View full profile
            </Link>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ObservationChat learnerId={learner.learner_id} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Failed to load learner for observation:", error);
    return unavailable(
      "Could not load this learner from PostgreSQL. Verify the database is healthy and the development data has been imported.",
      learnerId,
    );
  }
}
