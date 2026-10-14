import { connection } from "next/server";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Link from "next/link";
import EvidenceReasoning from "@/components/evidence/EvidenceReasoning";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { buildEvidenceSummary } from "@/lib/services/evidence-summary";
import { loadCurrentAssessments } from "@/lib/services/evidence-reasoning";

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
    const currentAssessments = await loadCurrentAssessments(
      tests.map((test) => test.test_id),
      teacher,
    );
    const assessmentByTestId = new Map(
      currentAssessments.map((assessment) => [assessment.test_id, assessment]),
    );
    return (
      <main className="min-h-full bg-[#f3f6fb] px-3 py-4 text-[#172554] dark:bg-[#0b1422] dark:text-gray-100 sm:px-5 md:px-6">
        <div className="mb-4 flex justify-end">
          <Button variant="outline-solid" className="shrink-0">
            <Link href={`/try-this/${encodeURIComponent(learnerId)}`}>
              Try This
            </Link>
          </Button>
        </div>
        <EvidenceReasoning
          learnerId={learnerId}
          learner={{
            display_name: learner.display_name,
            grade_level: learner.grade_level,
            stream_label: learner.stream_label,
            academic_year: learner.academic_year,
          }}
          observations={summary.observations.map((observation) => ({
            observed_at: observation.observed_at.toISOString(),
          }))}
          tests={tests.map((test) => ({
            ...test,
            assessment: assessmentByTestId.get(test.test_id) ?? null,
          }))}
        />
      </main>
    );
  } catch (error) {
    console.error("Failed to load learner evidence:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Learner evidence unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          The evidence records could not be loaded. Check the development server logs.
        </p>
      </Card>
    );
  }
}
