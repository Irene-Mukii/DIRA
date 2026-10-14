"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Card from "@/components/ui/Card";

interface ApprovedTest {
  test_id: string;
  exploration_question: string | null;
  hypothesis: string | null;
  suggested_activity: string;
  activity_date: string;
  purpose: string | null;
  what_to_observe: string[];
}

interface LogObservationResponse {
  error?: string;
  observation?: {
    observation_id?: string;
  };
}

function localDateValue(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function ApprovedTests({
  learnerId,
  tests,
}: {
  learnerId: string;
  tests: ApprovedTest[];
}) {
  const router = useRouter();
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [observedDate, setObservedDate] = useState(localDateValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submissionId = useRef<string | null>(null);

  function openForm(testId: string) {
    setActiveTestId(testId);
    setContent("");
    setObservedDate(localDateValue());
    setError("");
    setMessage("");
    submissionId.current = null;
  }

  function closeForm() {
    setActiveTestId(null);
    setError("");
    submissionId.current = null;
  }

  async function saveOutcome(
    event: React.FormEvent<HTMLFormElement>,
    testId: string,
  ) {
    event.preventDefault();
    const observation = content.trim();
    if (!observation) {
      setError("Enter the outcome observation before saving.");
      return;
    }
    if (!observedDate) {
      setError("Select the date the activity was observed.");
      return;
    }

    submissionId.current ??= crypto.randomUUID();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/mcp/log-observation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learner_id: learnerId,
          observation_type: "test_result",
          content: observation,
          observed_at: `${observedDate}T12:00:00Z`,
          linked_test_id: testId,
          capture_method: "text",
          submission_id: submissionId.current,
        }),
      });
      const payload = await response.json() as LogObservationResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not save the test outcome.");
      }
      if (!payload.observation?.observation_id) {
        throw new Error("The server did not confirm the saved test outcome.");
      }

      submissionId.current = null;
      setContent("");
      setActiveTestId(null);
      setMessage("Outcome saved and added to Recent Observations.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the test outcome.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden border-indigo-200 dark:border-[#303454] dark:bg-[#171b35]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-[#303454] dark:bg-[#1d2342]">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Suggested Tests to Complete
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Teacher-approved activities waiting for an outcome.
          </p>
        </div>
        {tests.length > 0 && (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-indigo-900 dark:bg-gray-800 dark:text-indigo-200">
            {tests.length} awaiting outcome
          </span>
        )}
      </div>

      {message && (
        <p role="status" className="px-4 pt-3 text-sm text-green-700 dark:text-green-300">
          {message}
        </p>
      )}

      {tests.length === 0 ? (
        <p className="p-4 text-sm text-gray-600 dark:text-gray-300">
          All approved tests have recorded outcomes. New approved tests will appear here.
        </p>
      ) : (
        <div className="space-y-2 p-3">
          {tests.map((test) => (
            <article
              key={test.test_id}
              className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#26364b] dark:bg-[#111e30]"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      {test.exploration_question ?? test.suggested_activity}
                    </h3>
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-900 dark:bg-purple-950 dark:text-purple-200">
                      Approved · Awaiting outcome
                    </span>
                  </div>
                  {test.hypothesis && (
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                      {test.hypothesis}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                    {test.suggested_activity}
                  </p>
                  {test.purpose && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {test.purpose}
                    </p>
                  )}
                  {test.what_to_observe.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Observe: {test.what_to_observe.join(" · ")}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Suggested {formatDate(test.activity_date)} · {test.test_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openForm(test.test_id)}
                  className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Record outcome
                </button>
              </div>

              {activeTestId === test.test_id && (
                <form
                  onSubmit={(event) => void saveOutcome(event, test.test_id)}
                  className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Record outcome for this activity
                    </h4>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      {test.exploration_question ?? test.suggested_activity}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor={`outcome-${test.test_id}`}
                      className="mb-1 block text-sm font-medium text-gray-800 dark:text-gray-100"
                    >
                      What did you observe?
                    </label>
                    <textarea
                      id={`outcome-${test.test_id}`}
                      required
                      maxLength={20_000}
                      rows={3}
                      value={content}
                      onChange={(event) => {
                        setContent(event.target.value);
                        submissionId.current = null;
                      }}
                      className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`outcome-date-${test.test_id}`}
                      className="mb-1 block text-sm font-medium text-gray-800 dark:text-gray-100"
                    >
                      Observed on
                    </label>
                    <input
                      id={`outcome-date-${test.test_id}`}
                      type="date"
                      required
                      value={observedDate}
                      onChange={(event) => {
                        setObservedDate(event.target.value);
                        submissionId.current = null;
                      }}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={saving || !content.trim()}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save outcome"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={closeForm}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  )}
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
