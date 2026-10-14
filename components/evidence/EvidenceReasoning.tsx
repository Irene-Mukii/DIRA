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

interface RelatedObservation {
  observation_id: string;
  observation_type: string;
  original_observation: string;
  reviewed_observation: string | null;
  observed_at: string;
  teacher_id: string;
  teacher_review_status: string;
  citation_role: "supporting" | "contradicting" | "context";
}

interface EvidenceTest {
  test_id: string;
  status: "SUGGESTED" | "ACCEPTED" | "COMPLETED";
  exploration_question: string | null;
  hypothesis: string | null;
  suggested_activity: string;
  activity_date: string;
  purpose: string | null;
  estimated_minutes: number | null;
  what_to_observe: string[];
  what_to_log_after: string[];
  limitations: string[];
  retrieval_status: string;
  educational_sources: unknown;
  outcome_observation_id: string | null;
  observed_outcome: string | null;
  cited_observations: RelatedObservation[];
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

interface LearnerHeader {
  display_name: string;
  grade_level: string;
  stream_label: string;
  academic_year: number;
}

function responseMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateRange(observations: Array<{ observed_at: string }>): string | null {
  if (observations.length === 0) return null;
  const timestamps = observations.map((observation) =>
    new Date(observation.observed_at).getTime(),
  ).filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  const earliest = new Date(Math.min(...timestamps));
  const latest = new Date(Math.max(...timestamps));
  const format = (date: Date) =>
    date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return earliest.getTime() === latest.getTime()
    ? format(earliest)
    : `${format(earliest)} – ${format(latest)}`;
}

function classificationLabel(classification: SavedAssessment["classification"]) {
  switch (classification) {
    case "SUPPORTS":
      return "Supported in this tested context";
    case "MIXED":
      return "Some evidence";
    case "CONTRADICTS":
      return "Contradicts in this tested context";
    case "INSUFFICIENT_EVIDENCE":
      return "Insufficient evidence";
  }
}

function classificationStyle(classification: SavedAssessment["classification"]) {
  switch (classification) {
    case "SUPPORTS":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "MIXED":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "CONTRADICTS":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200";
    case "INSUFFICIENT_EVIDENCE":
      return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-gray-200";
  }
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: "document" | "area" | "activity" | "outcome" | "observation" | "chevron";
  className?: string;
}) {
  const paths = {
    document: (
      <>
        <path d="M7 3.75h7l4.25 4.5v12H7z" />
        <path d="M14 3.75v4.5h4.25M10 12h5M10 15.5h5" />
      </>
    ),
    area: (
      <>
        <circle cx="9" cy="8" r="2.5" />
        <circle cx="16" cy="9" r="2" />
        <path d="M4.5 18v-1.2A4.5 4.5 0 0 1 9 12.3a4.5 4.5 0 0 1 4.5 4.5V18zM14 13a3.5 3.5 0 0 1 5.5 2.8V18h-4" />
      </>
    ),
    activity: (
      <>
        <path d="M9 3.75h6M10 3.75v5l-5.5 9.4A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.9L14 8.75v-5" />
        <path d="M7.4 16h9.2" />
      </>
    ),
    outcome: (
      <>
        <path d="M4 19.5V5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H7" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    observation: (
      <>
        <path d="M6.5 3.75h8l4 4v12.5h-12z" />
        <path d="M14.5 3.75v4h4M9.5 12h6M9.5 15.5h6" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function ClaimGroup({
  title,
  claims,
}: {
  title: string;
  claims: EvidenceClaim[];
}) {
  if (claims.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold text-[#263b67] dark:text-gray-100">{title}</h4>
      <ul className="mt-1 list-inside list-disc space-y-1">
        {claims.map((claim, index) => (
          <li key={`${title}-${index}`}>
            {claim.statement}
            {claim.evidence_refs.length > 0 && (
              <span className="ml-1 text-xs text-slate-500 dark:text-gray-400">
                [{claim.evidence_refs.join(", ")}]
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StringGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold text-[#263b67] dark:text-gray-100">{title}</h4>
      <ul className="mt-1 list-inside list-disc space-y-1">
        {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
      </ul>
    </div>
  );
}

export default function EvidenceReasoning({
  learnerId,
  learner,
  observations,
  tests,
}: {
  learnerId: string;
  learner: LearnerHeader;
  observations: Array<{ observed_at: string }>;
  tests: EvidenceTest[];
}) {
  const activeSummaryRequest = useRef<Promise<void> | null>(null);
  const summaryRequestId = useRef<string | null>(null);
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Map<string, SavedAssessment>>(
    () => new Map(tests.flatMap((test) =>
      test.assessment ? [[test.test_id, test.assessment] as const] : [],
    )),
  );
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set());
  const [expandedActivityDetails, setExpandedActivityDetails] = useState<Set<string>>(
    () => new Set(),
  );
  const [assessingTestId, setAssessingTestId] = useState<string | null>(null);
  const [assessmentErrors, setAssessmentErrors] = useState(new Map<string, string>());
  const [notAssessable, setNotAssessable] = useState(new Map<string, string>());

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
      const result = await response.json() as SummaryResponse;
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
      const result = await response.json() as AssessmentResponse;
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error?.message ?? "The hypothesis could not be assessed.",
        );
      }
      if (result.status === "not_assessable_yet") {
        setNotAssessable((current) => new Map(current).set(
          testId,
          result.message ?? "A recorded outcome is required before assessment.",
        ));
      } else if (result.assessment) {
        setAssessments((current) => new Map(current).set(testId, result.assessment!));
      }
    } catch (error) {
      setAssessmentErrors((current) => new Map(current).set(
        testId,
        responseMessage(error, "The hypothesis could not be assessed."),
      ));
    } finally {
      setAssessingTestId(null);
    }
  };

  const toggleArea = (testId: string) => {
    setExpandedAreas((current) => {
      const next = new Set(current);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  };

  const toggleActivityDetails = (testId: string) => {
    setExpandedActivityDetails((current) => {
      const next = new Set(current);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  };

  const range = dateRange(observations);
  const initials = learner.display_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <section className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm dark:border-[#26364b] dark:bg-[#111e30] sm:p-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#e8edf8] text-xl font-semibold text-[#465d94] dark:bg-[#26364b] dark:text-blue-200"
            >
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#101d4c] dark:text-gray-100">
                {learner.display_name}
              </h1>
              <p className="mt-1 text-base text-slate-600 dark:text-gray-300">
                {learner.grade_level} <span className="px-1">·</span> Stream{" "}
                {learner.stream_label} <span className="px-1">·</span>{" "}
                {learner.academic_year}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <h2 className="text-lg font-bold text-[#101d4c] dark:text-gray-100">
              Learner Evidence Card
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">
              Based on classroom observations and tests
            </p>
            {range && <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{range}</p>}
          </div>
        </header>
      </section>

      <section className="rounded-xl border border-[#e5eaf2] bg-white p-3 shadow-sm dark:border-[#26364b] dark:bg-[#111e30] sm:p-4">
        <article className="rounded-xl border border-[#e6e2f6] bg-[#f3f0ff] p-4 dark:border-[#44385f] dark:bg-[#201b34] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e8ddff] text-[#7941ca] dark:bg-[#3b2d5c] dark:text-purple-200">
              <Icon name="document" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-[#101d4c] dark:text-gray-100">
                Summary of evidence
              </h2>
              {summaryLoading ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-gray-300" role="status">
                  Generating a summary from saved classroom evidence…
                </p>
              ) : summaryError ? (
                <div className="mt-2 flex flex-wrap items-center gap-3" role="alert">
                  <p className="text-sm text-rose-700 dark:text-rose-300">{summaryError}</p>
                  <button
                    type="button"
                    onClick={() => void loadSummary()}
                    className="rounded-lg border border-[#c9d4e8] bg-white px-3 py-1.5 text-sm font-semibold text-[#1555ad] hover:bg-[#f7f9fd] dark:border-[#3b4d67] dark:bg-[#17263a] dark:text-blue-300 dark:hover:bg-[#22334a]"
                  >
                    Retry summary
                  </button>
                </div>
              ) : summary ? (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#344563] dark:text-gray-200">
                    {summary.summary}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                    This summary describes the available classroom evidence; it is
                    not a diagnosis or a fixed label.
                  </p>
                  {(summary.observed_facts.length > 0 ||
                    summary.tentative_interpretations.length > 0 ||
                    summary.conflicting_evidence.length > 0 ||
                    summary.gaps.length > 0 ||
                    summary.limitations.length > 0) && (
                    <details className="mt-3 border-t border-[#ded8f2] pt-2 text-sm text-[#344563] dark:border-[#44385f] dark:text-gray-200">
                      <summary className="w-fit cursor-pointer font-semibold text-[#4c5d83] dark:text-purple-200">
                        How this summary is grounded
                      </summary>
                      <div className="mt-3 space-y-3">
                        <ClaimGroup title="Observed facts" claims={summary.observed_facts} />
                        <ClaimGroup
                          title="Tentative interpretations"
                          claims={summary.tentative_interpretations}
                        />
                        <ClaimGroup
                          title="Conflicting evidence"
                          claims={summary.conflicting_evidence}
                        />
                        <StringGroup title="Evidence gaps" items={summary.gaps} />
                        <StringGroup title="Limitations" items={summary.limitations} />
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">
                  No evidence summary is available.
                </p>
              )}
            </div>
          </div>
        </article>

        <section aria-label="Evidence areas" className="mt-2 space-y-2">
          {tests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#d6deeb] px-4 py-6 text-center text-sm text-slate-500 dark:border-[#334155] dark:text-gray-400">
              No classroom test activities have been saved for this learner yet.
            </p>
          ) : (
            tests.map((test) => {
              const assessment = assessments.get(test.test_id);
              const expanded = expandedAreas.has(test.test_id);
              const canAssess = Boolean(
                test.hypothesis?.trim() && test.outcome_observation_id,
              );
              const badgeLabel = assessment
                ? classificationLabel(assessment.classification)
                : !test.outcome_observation_id
                  ? "Outcome not recorded"
                  : !test.hypothesis?.trim()
                    ? "Not assessable"
                    : "Not assessed";
              const badgeClass = assessment
                ? classificationStyle(assessment.classification)
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-gray-200";
              const areaTitle =
                test.hypothesis?.trim() ||
                test.exploration_question ||
                test.purpose ||
                "Classroom test activity";
              const areaDescription =
                test.exploration_question ??
                test.purpose ??
                "Evidence from a teacher-approved classroom activity.";

              return (
                <article
                  key={test.test_id}
                  className={`overflow-hidden rounded-xl border ${
                    expanded
                      ? "border-[#f0dce6] bg-[#fffafd] dark:border-[#563849] dark:bg-[#211923]"
                      : "border-[#e5eaf2] bg-white dark:border-[#26364b] dark:bg-[#111e30]"
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`evidence-details-${encodeURIComponent(test.test_id)}`}
                    onClick={() => toggleArea(test.test_id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#fafbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-[#1a2a40] sm:gap-4 sm:px-4"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fce8ef] text-[#b62254] dark:bg-[#4a2639] dark:text-pink-200">
                      <Icon name="area" className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-[#142451] dark:text-gray-100">
                        {areaTitle}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-sm text-slate-600 dark:text-gray-300">
                        {areaDescription}
                      </span>
                    </span>
                    <span
                      className={`max-w-[120px] shrink-0 rounded-full px-2 py-1 text-center text-[10px] font-semibold leading-4 sm:max-w-none sm:px-3 sm:text-sm ${badgeClass}`}
                    >
                      {badgeLabel}
                    </span>
                    <Icon
                      name="chevron"
                      className={`h-5 w-5 shrink-0 text-[#33415f] transition-transform dark:text-gray-300 ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <div
                    id={`evidence-details-${encodeURIComponent(test.test_id)}`}
                    hidden={!expanded}
                    className="space-y-2 border-t border-[#f0dce6] px-3 py-3 dark:border-[#563849] sm:px-4"
                  >
                      <section className="ml-2 border-l-2 border-[#dbe5f7] pl-4 dark:border-[#334155]">
                        <div className="rounded-lg border border-[#e4ebf8] bg-[#f5f8ff] p-3 dark:border-[#334155] dark:bg-[#17263a] sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e2efff] text-[#2875bd] dark:bg-[#233d5a] dark:text-blue-300">
                              <Icon name="activity" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-[#142451] dark:text-gray-100">Test activity</h3>
                              <p className="mt-1 text-sm font-medium text-[#263b67] dark:text-gray-200">
                                {test.purpose ?? test.exploration_question ?? "Classroom activity"}
                              </p>
                              {test.estimated_minutes && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                                  About {test.estimated_minutes} minutes
                                </p>
                              )}
                              {test.what_to_observe.length > 0 && (
                                <div className="mt-2">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
                                    What to observe
                                  </h4>
                                  <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-gray-200">
                                    {test.what_to_observe.map((item, index) => (
                                      <li key={`${test.test_id}-observe-${index}`}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <button
                                type="button"
                                aria-expanded={expandedActivityDetails.has(test.test_id)}
                                onClick={() => toggleActivityDetails(test.test_id)}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#d7e4f5] bg-white px-3 py-2 text-sm font-semibold text-[#1763b7] hover:bg-[#f8fbff] dark:border-[#3b4d67] dark:bg-[#111e30] dark:text-blue-300 dark:hover:bg-[#22334a]"
                              >
                                <Icon name="document" className="h-4 w-4" />
                                {expandedActivityDetails.has(test.test_id)
                                  ? "Hide full details"
                                  : "View full details"}
                              </button>
                              {expandedActivityDetails.has(test.test_id) && (
                                <div className="mt-3 space-y-3 border-t border-[#dce6f4] pt-3 dark:border-[#334155]">
                                  <div>
                                    <h4 className="text-sm font-semibold text-[#263b67] dark:text-gray-100">
                                      Activity instructions
                                    </h4>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">
                                      {test.suggested_activity}
                                    </p>
                                  </div>
                                  {test.what_to_log_after.length > 0 && (
                                    <StringGroup
                                      title="What to log after"
                                      items={test.what_to_log_after}
                                    />
                                  )}
                                  {test.limitations.length > 0 && (
                                    <StringGroup title="Activity limitations" items={test.limitations} />
                                  )}
                                  <p className="text-xs text-slate-500 dark:text-gray-400">
                                    Test {test.test_id} · Planned {formatDate(test.activity_date)} ·
                                    {" "}Activity status: {test.status.toLowerCase()}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="ml-2 border-l-2 border-[#dbe5f7] pl-4 dark:border-[#334155]">
                        <div className="rounded-lg border border-[#d9eee6] bg-[#f1fbf6] p-3 dark:border-[#285344] dark:bg-[#142b26] sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcf5e9] text-[#16875c] dark:bg-[#1e4939] dark:text-emerald-300">
                              <Icon name="outcome" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-bold text-[#142451] dark:text-gray-100">Outcome</h3>
                                {assessment && (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classificationStyle(assessment.classification)}`}>
                                    {classificationLabel(assessment.classification)}
                                  </span>
                                )}
                              </div>
                              {test.outcome_observation_id && test.observed_outcome ? (
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">
                                  {test.observed_outcome}
                                </p>
                              ) : (
                                <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">
                                  Outcome not yet recorded. An approved activity alone is not evidence of its result.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="ml-2 border-l-2 border-[#eadcf3] pl-4 dark:border-[#4e3458]">
                        <div className="rounded-lg border border-[#efe3f3] bg-[#fbf5fc] p-3 dark:border-[#4e3458] dark:bg-[#251a2d] sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4e1f7] text-[#9a3ca0] dark:bg-[#44264a] dark:text-fuchsia-200">
                              <Icon name="observation" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-[#142451] dark:text-gray-100">Related observations</h3>
                              {test.cited_observations.length === 0 ? (
                                <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                  No additional observations are linked to this activity.
                                </p>
                              ) : (
                                <ul className="mt-2 space-y-3">
                                  {test.cited_observations.map((observation) => (
                                    <li
                                      key={observation.observation_id}
                                      className="flex items-start gap-2"
                                    >
                                      <Icon
                                        name="observation"
                                        className="mt-0.5 h-4 w-4 shrink-0 text-[#8d4a9b] dark:text-fuchsia-300"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm leading-5 text-slate-700 dark:text-gray-200">
                                          {observation.reviewed_observation ??
                                            observation.original_observation}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                                          {observation.teacher_review_status === "not_required"
                                            ? "Teacher observation"
                                            : `Teacher · ${observation.teacher_review_status}`}{" "}
                                          · {formatDate(observation.observed_at)} ·{" "}
                                          {observation.observation_type.replaceAll("_", " ")} ·{" "}
                                          {observation.citation_role}
                                        </p>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-lg border border-[#e8eaf0] bg-white p-3 dark:border-[#26364b] dark:bg-[#111e30] sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-[#142451] dark:text-gray-100">Hypothesis assessment</h3>
                            {test.hypothesis ? (
                              <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{test.hypothesis}</p>
                            ) : (
                              <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                This activity has no saved hypothesis to assess.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={!canAssess || assessingTestId === test.test_id}
                            onClick={() => void assess(test.test_id)}
                            className="rounded-lg bg-[#1763b7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#124f96] disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                          >
                            {assessingTestId === test.test_id
                              ? "Assessing…"
                              : assessment
                                ? "Reassess"
                                : "Assess hypothesis"}
                          </button>
                        </div>
                        {!canAssess && test.hypothesis && !test.outcome_observation_id && (
                          <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                            An actual teacher-recorded outcome is required before this hypothesis can be assessed.
                          </p>
                        )}
                        {notAssessable.has(test.test_id) && (
                          <p role="status" className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                            Not assessable yet — {notAssessable.get(test.test_id)}
                          </p>
                        )}
                        {assessmentErrors.has(test.test_id) && (
                          <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                            {assessmentErrors.get(test.test_id)}
                          </p>
                        )}
                        {assessment && (
                          <div className="mt-3 space-y-3 border-t border-[#e8eaf0] pt-3 text-sm text-slate-700 dark:border-[#334155] dark:text-gray-200">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classificationStyle(assessment.classification)}`}>
                                {classificationLabel(assessment.classification)}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-gray-400">
                                Assessment {assessment.version} · {formatDate(assessment.assessed_at)}
                              </span>
                            </div>
                            <p>{assessment.rationale}</p>
                            {assessment.change_explanation && (
                              <p>
                                <span className="font-semibold">Change since prior assessment: </span>
                                {assessment.change_explanation}
                              </p>
                            )}
                            <StringGroup title="Uncertainty" items={assessment.uncertainty} />
                            <StringGroup title="Limitations" items={assessment.limitations} />
                            <StringGroup
                              title="What could help next"
                              items={assessment.next_information_needed}
                            />
                            {assessment.research_references.length > 0 ? (
                              <div>
                                <h4 className="font-semibold text-[#263b67] dark:text-gray-100">
                                  Retrieved educational sources
                                </h4>
                                <ul className="mt-1 space-y-1">
                                  {assessment.research_references.map((reference) => (
                                    <li key={`${assessment.assessment_id}-${reference.key}`}>
                                      <a
                                        className="text-[#1763b7] underline underline-offset-2 dark:text-blue-300"
                                        href={reference.page_url}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {reference.key}: {reference.title}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-gray-400">
                                External research: {assessment.research_retrieval_status.replaceAll("_", " ")}.
                                No external sources were cited.
                              </p>
                            )}
                          </div>
                        )}
                      </section>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </section>

      <p className="px-1 text-xs leading-5 text-slate-500 dark:text-gray-400">
        These assessments describe evidence in the specific tested context. They
        are not diagnoses or fixed conclusions about the learner.
      </p>
    </div>
  );
}
