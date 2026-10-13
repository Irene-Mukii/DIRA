"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface EvidenceClaim {
  statement: string;
  evidence_refs: string[];
}

interface EvidenceSummary {
  summary: string;
  observed_facts: EvidenceClaim[];
  tentative_interpretations: EvidenceClaim[];
  conflicting_evidence: EvidenceClaim[];
  gaps: string[];
  limitations: string[];
}

interface SavedAssessment {
  assessment_id: string;
  test_id: string;
  version: number;
  classification:
    | "SUPPORTS"
    | "MIXED"
    | "CONTRADICTS"
    | "INSUFFICIENT_EVIDENCE";
  rationale: string;
  uncertainty: string[];
  limitations: string[];
  next_information_needed: string[];
  evidence_references: string[];
  research_retrieval_status: "success" | "partial" | "no_relevant_results" | "failed";
  research_references: Array<{
    key: string;
    title: string;
    page_url: string;
  }>;
  assessed_at: string;
  model: string;
  trigger: "initial" | "reassessment";
  change_explanation: string;
}

interface AssessableTest {
  test_id: string;
  hypothesis: string | null;
  outcome_observation_id: string | null;
  assessment: SavedAssessment | null;
}

interface SummaryResponse {
  ok: boolean;
  summary?: EvidenceSummary;
  error?: { message?: string; retryable?: boolean };
}

interface AssessmentResponse {
  ok: boolean;
  status?: "assessed" | "not_assessable_yet";
  assessment?: SavedAssessment;
  message?: string;
  error?: { message?: string; retryable?: boolean };
}

function responseMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function classificationLabel(classification: SavedAssessment["classification"]) {
  switch (classification) {
    case "SUPPORTS":
      return "Supports in this tested context";
    case "MIXED":
      return "Mixed evidence";
    case "CONTRADICTS":
      return "Contradicts in this tested context";
    case "INSUFFICIENT_EVIDENCE":
      return "Insufficient evidence";
  }
}

export default function EvidenceReasoning({
  learnerId,
  tests,
}: {
  learnerId: string;
  tests: AssessableTest[];
}) {
  const activeSummaryRequest = useRef<Promise<void> | null>(null);
  const summaryRequestId = useRef<string | null>(null);
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Map<string, SavedAssessment>>(
    () =>
      new Map<string, SavedAssessment>(
        tests.flatMap((test) =>
          test.assessment ? [[test.test_id, test.assessment] as const] : [],
        ),
      ),
  );
  const [assessingTestId, setAssessingTestId] = useState<string | null>(null);
  const [assessmentErrors, setAssessmentErrors] = useState(
    new Map<string, string>(),
  );
  const [notAssessable, setNotAssessable] = useState(
    new Map<string, string>(),
  );

  const loadSummary = useCallback(async () => {
    if (activeSummaryRequest.current) return activeSummaryRequest.current;
    if (!summaryRequestId.current) summaryRequestId.current = crypto.randomUUID();
    const requestId = summaryRequestId.current;
    setSummaryLoading(true);
    setSummaryError(null);
    const request = (async () => {
      const response = await fetch(
        `/api/evidence/${encodeURIComponent(learnerId)}/summary`,
        {
          method: "POST",
          headers: { "X-Request-ID": requestId },
        },
      );
      const result = (await response.json()) as SummaryResponse;
      if (!response.ok || !result.ok || !result.summary) {
        throw new Error(
          result.error?.message ?? "The evidence summary could not be generated.",
        );
      }
      setSummary(result.summary);
    })();
    activeSummaryRequest.current = request;
    try {
      await request;
    } catch (error) {
      summaryRequestId.current = null;
      setSummaryError(responseMessage(error, "The evidence summary could not be generated."));
    } finally {
      if (activeSummaryRequest.current === request) {
        activeSummaryRequest.current = null;
      }
      setSummaryLoading(false);
    }
  }, [learnerId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const assess = async (testId: string) => {
    setAssessingTestId(testId);
    setAssessmentErrors((current) => {
      const next = new Map(current);
      next.delete(testId);
      return next;
    });
    setNotAssessable((current) => {
      const next = new Map(current);
      next.delete(testId);
      return next;
    });
    try {
      const response = await fetch(
        `/api/evidence/${encodeURIComponent(learnerId)}/tests/${encodeURIComponent(testId)}/assessment`,
        {
          method: "POST",
          headers: { "X-Request-ID": crypto.randomUUID() },
        },
      );
      const result = (await response.json()) as AssessmentResponse;
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error?.message ?? "The hypothesis could not be assessed.",
        );
      }
      if (result.status === "not_assessable_yet") {
        setNotAssessable((current) =>
          new Map(current).set(
            testId,
            result.message ?? "A recorded outcome is required before assessment.",
          ),
        );
      } else if (result.assessment) {
        const assessment = result.assessment;
        setAssessments((current) => new Map(current).set(testId, assessment));
      }
    } catch (error) {
      setAssessmentErrors((current) => {
        const next = new Map(current);
        next.set(
          testId,
          responseMessage(error, "The hypothesis could not be assessed."),
        );
        return next;
      });
    } finally {
      setAssessingTestId(null);
    }
  };

  return (
    <section className="space-y-5" aria-label="Evidence reasoning">
      <article className="rounded-lg border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Evidence summary
        </h2>
        {summaryLoading ? (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300" role="status">
            Generating a summary from saved classroom evidence…
          </p>
        ) : summaryError ? (
          <div className="mt-2 space-y-3" role="alert">
            <p className="text-sm text-red-700 dark:text-red-300">{summaryError}</p>
            <button
              type="button"
              onClick={() => void loadSummary()}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-white dark:border-gray-600 dark:hover:bg-gray-800"
            >
              Retry summary
            </button>
          </div>
        ) : summary ? (
          <div className="mt-2 space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <p>{summary.summary}</p>
            {summary.observed_facts.length > 0 && (
              <ClaimList title="Recorded observations" claims={summary.observed_facts} />
            )}
            {summary.tentative_interpretations.length > 0 && (
              <ClaimList
                title="Tentative interpretations"
                claims={summary.tentative_interpretations}
              />
            )}
            {summary.conflicting_evidence.length > 0 && (
              <ClaimList
                title="Conflicting evidence"
                claims={summary.conflicting_evidence}
              />
            )}
            {summary.gaps.length > 0 && (
              <StringList title="Evidence gaps" items={summary.gaps} />
            )}
            {summary.limitations.length > 0 && (
              <StringList title="Limitations" items={summary.limitations} />
            )}
          </div>
        ) : null}
      </article>

      {tests.map((test) => {
        const assessment = assessments.get(test.test_id);
        const canAssess = Boolean(test.hypothesis && test.outcome_observation_id);
        return (
          <article
            key={test.test_id}
            className="rounded-lg border border-gray-200 p-5 dark:border-gray-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Hypothesis assessment
              </h3>
              <button
                type="button"
                disabled={!canAssess || assessingTestId === test.test_id}
                onClick={() => void assess(test.test_id)}
                className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assessingTestId === test.test_id
                  ? "Assessing…"
                  : assessment
                    ? "Reassess hypothesis"
                    : "Assess hypothesis"}
              </button>
            </div>
            {test.hypothesis && (
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                {test.hypothesis}
              </p>
            )}
            {!canAssess && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Not assessable yet —{" "}
                {!test.outcome_observation_id
                  ? "a teacher-recorded outcome is required."
                  : "a hypothesis is required."}
              </p>
            )}
            {notAssessable.has(test.test_id) && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300" role="status">
                Not assessable yet — {notAssessable.get(test.test_id)}
              </p>
            )}
            {assessmentErrors.has(test.test_id) && (
              <div className="mt-3 space-y-2" role="alert">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {assessmentErrors.get(test.test_id)}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  The previously saved assessment, if any, is unchanged.
                </p>
              </div>
            )}
            {assessment && (
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p className="font-medium">
                  {classificationLabel(assessment.classification)}
                  {" · Version "}
                  {assessment.version}
                </p>
                <p>{assessment.rationale}</p>
                {assessment.change_explanation && (
                  <p>
                    <span className="font-medium">Change since prior assessment:</span>{" "}
                    {assessment.change_explanation}
                  </p>
                )}
                {assessment.evidence_references.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Evidence records: {assessment.evidence_references.join(", ")}
                  </p>
                )}
                {assessment.uncertainty.length > 0 && (
                  <StringList title="Uncertainty" items={assessment.uncertainty} />
                )}
                {assessment.limitations.length > 0 && (
                  <StringList title="Limitations" items={assessment.limitations} />
                )}
                {assessment.next_information_needed.length > 0 && (
                  <StringList
                    title="What could help next"
                    items={assessment.next_information_needed}
                  />
                )}
                {assessment.research_references.length > 0 && (
                  <ul className="list-inside list-disc">
                    {assessment.research_references.map((reference) => (
                      <li key={`${assessment.assessment_id}-${reference.key}`}>
                        <a
                          className="underline"
                          href={reference.page_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {reference.key}: {reference.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {assessment.research_references.length === 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    External research: {assessment.research_retrieval_status.replaceAll("_", " ")}; no sources were cited.
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Assessed {assessment.assessed_at.slice(0, 10)} · {assessment.model}
                </p>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ClaimList({
  title,
  claims,
}: {
  title: string;
  claims: EvidenceClaim[];
}) {
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      <ul className="mt-1 list-inside list-disc space-y-1">
        {claims.map((claim, index) => (
          <li key={`${title}-${index}`}>
            {claim.statement}
            {claim.evidence_refs.length > 0 && (
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                [{claim.evidence_refs.join(", ")}]
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StringList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      <ul className="mt-1 list-inside list-disc space-y-1">
        {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
      </ul>
    </div>
  );
}
