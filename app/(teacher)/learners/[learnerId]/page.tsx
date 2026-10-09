import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export default function LearnerDetailPage({ params }: { params: { learnerId: string } }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Learner {params.learnerId}</h1>
          <p className="text-gray-500 dark:text-gray-400">Observation timeline and details</p>
        </div>
        <Button>
          <Link href={`/learners/${params.learnerId}/log-observation`}>Log Observation</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Observations</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">12</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Observed</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">2 days ago</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Tests Suggested</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">3</p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Observations</h2>
        <div className="space-y-3">
          <div className="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Active participation in group discussion</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Oct 8, 2026 • Participation</p>
            </div>
            <Badge variant="secondary">Saved</Badge>
          </div>
          <div className="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Struggled with reading comprehension</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Oct 7, 2026 • Academic</p>
            </div>
            <Badge variant="secondary">Saved</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
