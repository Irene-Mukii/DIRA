"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ObservationChat from "@/components/observations/ObservationChat";

export default function ObservationLogPage() {
  const params = useParams();
  const learnerId = params?.learnerId as string | undefined;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 py-4 bg-white dark:bg-gray-800">
        <Link
          href={learnerId ? `/learners/${encodeURIComponent(learnerId)}` : "/learners"}
          className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-3"
        >
          ← Back to Learner Record
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
              L
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {learnerId ? `Learner ${learnerId}` : "Select a learner"}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Observation timeline
              </p>
            </div>
          </div>
          <Link
            href={learnerId ? `/learners/${encodeURIComponent(learnerId)}` : "/learners"}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            View full profile
          </Link>
        </div>
      </div>
      <ObservationChat learnerId={learnerId} className="flex-1 min-h-0" />
    </div>
  );
}
