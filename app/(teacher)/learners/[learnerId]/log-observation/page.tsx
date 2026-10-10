import Link from "next/link";
import { connection } from "next/server";
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
    <div className="flex h-full flex-col px-4 md:px-6">
      <div className="rounded-t-2xl border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800 md:px-6">
        <Link
          href={`/learners/${encodeURIComponent(learnerId)}`}
          className="mb-3 inline-flex text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          ← Back to Learner Record
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
              {learnerId.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Learner {learnerId}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Observation timeline
              </p>
            </div>
          </div>
          <Link
            href={`/learners/${encodeURIComponent(learnerId)}`}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            View full profile
          </Link>
        </div>
      </div>
      <div className="rounded-b-2xl bg-white dark:bg-gray-900 flex-1 overflow-hidden p-4">
        <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
          <p>{message}</p>
        </div>
      </div>
    </div>
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
        {/* Learner Header - rounded top corners, square bottom */}
        <header className="rounded-t-2xl border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800 md:px-6 flex-shrink-0">
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
        </header>

        {/* Conversation Workspace - square top corners, rounded bottom corners */}
        <main className="rounded-b-2xl bg-white dark:bg-gray-900 flex-1 overflow-hidden min-h-0">
          <ObservationChat learnerId={learner.learner_id} />
        </main>
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