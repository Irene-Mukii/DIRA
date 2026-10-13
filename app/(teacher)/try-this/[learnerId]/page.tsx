"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

interface SourceResult {
  key: string;
  name: string;
  status: "success" | "no_relevant_results" | "failed";
  page_url: string | null;
  title: string | null;
  excerpt: string | null;
  error: string | null;
  http_status: number | null;
  retrieval_duration_ms: number | null;
}

interface ProposedSuggestion {
  ok: boolean;
  status: string;
  proposal_id?: string;
  test_id?: string;
  message?: string;
  exploration_question?: string;
  hypothesis?: string;
  reason?: string;
  suggested_activity?: {
    title: string;
    duration_minutes: number;
    purpose: string;
    steps: string[];
    what_to_observe: string[];
    intended_outcome?: string;
    assessment_criteria?: string[];
  };
  what_to_log_afterward?: string[];
  cited_observations?: Array<{ observation_id: string; content: string }>;
  limitations?: string[];
  retrieval_status?: string;
  educational_sources?: SourceResult[];
}

interface RegenerationResponse {
  rejected_test_id: string;
  suggestion: ProposedSuggestion;
}

export default function TryThisPage({ params }: { params: Promise<{ learnerId: string }> }) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<ProposedSuggestion | null>(null);
  const [supersedesTestId, setSupersedesTestId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10));
  const [learnerId, setLearnerId] = useState<string>("");

  useEffect(() => {
    params.then((p) => setLearnerId(p.learnerId));
  }, [params]);

  async function request(
    action: "suggest" | "regenerate" | "accept",
  ): Promise<void> {
    if (!learnerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mcp/suggest-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          learner_id: learnerId,
          submission_id: crypto.randomUUID(),
          ...(action !== "suggest" && suggestion?.proposal_id
            ? { proposal_id: suggestion.proposal_id }
            : {}),
          ...(action === "regenerate" && (suggestion?.test_id || supersedesTestId)
            ? { supersedes_test_id: suggestion?.test_id ?? supersedesTestId }
            : {}),
          ...(action === "accept"
            ? {
                planned_date: plannedDate,
                ...(supersedesTestId
                  ? { supersedes_test_id: supersedesTestId }
                  : {}),
              }
            : {}),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "The suggestion request failed.";
        throw new Error(error);
      }
      if (action === "accept") {
        setSuggestion(null);
        setSupersedesTestId(undefined);
        setMessage("Test accepted and saved.");
        router.refresh();
      } else if (action === "regenerate") {
        const regenerated = data as RegenerationResponse;
        setSupersedesTestId(regenerated.rejected_test_id);
        setSuggestion(regenerated.suggestion);
      } else {
        setSuggestion(data as ProposedSuggestion);
        setSupersedesTestId(undefined);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The suggestion request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Try This</h1>
        <p className="text-gray-500 dark:text-gray-400">Suggested activities for Learner {learnerId}</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          {!suggestion && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Explore a question
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Generate an on-demand classroom activity from reviewed observations.
                  A teacher decides whether to accept it or request another.
                </p>
              </div>
              <button
                type="button"
                disabled={busy || !learnerId}
                onClick={() => void request("suggest")}
                className="shrink-0 cursor-pointer rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 active:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Preparing suggestion…" : "Suggest Test"}
              </button>
            </div>
          )}

          {suggestion && !suggestion.ok && (
            <div role="status" className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-200">
              <p>{suggestion.message ?? `No suggestion available (${suggestion.status}).`}</p>
              <button
                type="button"
                disabled={busy || !learnerId}
                onClick={() => void request("suggest")}
                className="cursor-pointer rounded-md border border-gray-400 px-3 py-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-gray-700"
              >
                Check again
              </button>
            </div>
          )}

          {suggestion?.ok && suggestion.suggested_activity && (
            <div className="mt-3 space-y-4 rounded-md bg-gray-50 p-4 dark:bg-[#0b1422]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  Proposed for teacher review
                </p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                  {suggestion.exploration_question}
                </h3>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                  {suggestion.reason}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  {suggestion.suggested_activity.title}
                </h4>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {suggestion.suggested_activity.purpose} (
                  {suggestion.suggested_activity.duration_minutes} minutes)
                </p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-700 dark:text-gray-200">
                  {suggestion.suggested_activity.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {suggestion.suggested_activity.intended_outcome && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                    Intended outcome: {suggestion.suggested_activity.intended_outcome}
                  </p>
                )}
                {suggestion.suggested_activity.assessment_criteria && (
                  <ul className="mt-2 list-inside list-disc text-sm text-gray-700 dark:text-gray-200">
                    {suggestion.suggested_activity.assessment_criteria.map((criterion) => (
                      <li key={criterion}>{criterion}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  Evidence considered
                </h4>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-700 dark:text-gray-200">
                  {suggestion.cited_observations?.map((item) => (
                    <li key={item.observation_id}>
                      {item.content} <span className="text-xs">({item.observation_id})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  Education sources · {suggestion.retrieval_status ?? "unavailable"}
                </h4>
                <ul className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                  {suggestion.educational_sources?.map((source) => (
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
                          {source.error && ` · ${source.error.replaceAll("_", " ")}`}
                          {source.http_status && ` · HTTP ${source.http_status}`}
                        </span>
                      )}
                      {source.excerpt && <p className="pl-4 text-xs">{source.excerpt}</p>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label
                  htmlFor="evidence-test-date"
                  className="block text-sm font-medium text-gray-800 dark:text-gray-100"
                >
                  Planned date
                </label>
                <input
                  id="evidence-test-date"
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                  className="mt-1 rounded border border-gray-400 bg-white px-2 py-1 text-sm dark:bg-gray-900"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !learnerId}
                  onClick={() => void request("accept")}
                  className="cursor-pointer rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 active:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Accept test"}
                </button>
                <button
                  type="button"
                  disabled={busy || !learnerId}
                  onClick={() => void request("regenerate")}
                  className="cursor-pointer rounded-md border border-gray-400 px-3 py-2 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-gray-700"
                >
                  {busy ? "Preparing…" : "Reject and suggest another"}
                </button>
              </div>
              {suggestion.limitations && (
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Limitations: {suggestion.limitations.join(" ")}
                </p>
              )}
            </div>
          )}

          {message && (
            <p role="status" className="mt-3 text-sm text-gray-700 dark:text-gray-200">
              {message}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}