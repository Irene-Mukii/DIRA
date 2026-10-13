import { connection } from "next/server";
import Card from "@/components/ui/Card";
import SuggestionWorkflow from "@/components/evidence/SuggestionWorkflow";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { buildEvidenceSummary } from "@/lib/services/evidence-summary";

function statusLabel(
  status: "SUGGESTED" | "ACCEPTED" | "COMPLETED",
  wasSuperseded: boolean,
): string {
  switch (status) {
    case "SUGGESTED":
      return wasSuperseded
        ? "Rejected · replacement suggested"
        : "Suggested · awaiting teacher decision";
    case "ACCEPTED":
      return "Accepted · outcome not yet recorded";
    case "COMPLETED":
      return "Completed · teacher outcome recorded";
  }
}

function sourceLinks(value: unknown): Array<{
  key: string;
  status: string;
  title: string | null;
  page_url: string | null;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.status !== "string") return [];
    return [{
      key: row.key,
      status: row.status,
      title: typeof row.title === "string" ? row.title : null,
      page_url: typeof row.page_url === "string" ? row.page_url : null,
    }];
  });
}

export default async function EvidencePage({
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
        <h1 className="text-xl font-semibold">Learner evidence unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Evidence records require an authenticated teacher session, which is not configured.
        </p>
      </Card>
    );
  }

  const teacher = await resolveTeacherContext();
  if (!teacher) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learner evidence unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Add a teacher record before viewing the single-teacher demo.
        </p>
      </Card>
    );
  }

  try {
    const summary = await buildEvidenceSummary(learnerId, teacher);
    const learner = summary.learner;
    const tests = summary.tests;
    const supersededTestIds = new Set(
      tests.flatMap((test) => test.supersedes_test_id ? [test.supersedes_test_id] : []),
    );

    return (
      <main className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Learner Evidence Card
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            {learner.display_name} · {learner.grade_level} · Stream{" "}
            {learner.stream_label} · {learner.academic_year}
          </p>
        </header>

        <SuggestionWorkflow learnerId={learner.learner_id} />

        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recorded observations
          </h2>
          {summary.observations.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No observations are available in a currently assigned class.
            </p>
          ) : (
            <ul className="space-y-3">
              {summary.observations.map((observation) => (
                <li
                  key={observation.observation_id}
                  className="border-b border-gray-200 pb-3 last:border-0 dark:border-gray-700"
                >
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {observation.reviewed_observation ?? observation.original_observation}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {observation.observation_id} · {observation.observation_type} ·{" "}
                    {new Date(observation.observed_at).toLocaleDateString()} ·{" "}
                    {observation.teacher_review_status}
                  </p>
                  {observation.reviewed_observation && (
                    <details className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      <summary>View original wording</summary>
                      <p className="mt-1">{observation.original_observation}</p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Tests and explored questions
          </h2>
          {tests.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No test suggestions have been saved for this learner.
            </p>
          ) : (
            <div className="space-y-5">
              {tests.map((test) => (
                <article
                  key={test.test_id}
                  className="space-y-2 border-b border-gray-200 pb-4 last:border-0 dark:border-gray-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      {test.exploration_question ?? test.suggested_activity}
                    </h3>
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">
                      {statusLabel(
                        test.status,
                        supersededTestIds.has(test.test_id),
                      )}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                    {test.suggested_activity}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Test {test.test_id} · Planned {test.activity_date} · External
                    retrieval: {test.retrieval_status.replaceAll("_", " ")}
                  </p>
                  {test.cited_observations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium">Cited observations</h4>
                      <ul className="list-inside list-disc text-sm text-gray-600 dark:text-gray-300">
                        {test.cited_observations.map((citation) => (
                          <li key={citation.observation_id}>
                            {citation.reviewed_observation ?? citation.original_observation}{" "}
                            <span className="text-xs">({citation.observation_id})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {test.observed_outcome && (
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      Teacher-recorded outcome: {test.observed_outcome}
                    </p>
                  )}
                  {sourceLinks(test.educational_sources).length > 0 && (
                    <ul className="text-sm">
                      {sourceLinks(test.educational_sources).map((source) => (
                        <li key={source.key}>
                          {source.page_url ? (
                            <a
                              href={source.page_url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {source.key}: {source.title ?? source.page_url}
                            </a>
                          ) : (
                            <span>
                              {source.key}: {source.status.replaceAll("_", " ")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </Card>

        <p className="text-xs text-gray-600 dark:text-gray-300">
          These records support teacher inquiry; they are not diagnoses or fixed
          conclusions about the learner. A teacher-recorded observation remains
          the source for every completed test outcome.
        </p>
      </main>
    );
  } catch (error) {
    console.error("Failed to load learner evidence:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learner evidence unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          The evidence records could not be loaded. Check the development database
          schema and server logs.
        </p>
      </Card>
    );
  }
}
