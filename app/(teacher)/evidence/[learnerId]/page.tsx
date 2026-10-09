import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

export default function EvidencePage({ params }: { params: { learnerId: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Learner Evidence Card</h1>
        <p className="text-gray-500 dark:text-gray-400">Evidence for Learner {params.learnerId}</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Questions Explored</h2>
        <div className="space-y-3">
          <div className="border-l-4 border-blue-500 pl-4 py-2">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">How to encourage active participation?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Status: Open • 2 supporting observations</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tests Conducted</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Think-pair-share activity</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Suggested Oct 8, 2026</p>
            </div>
            <Badge variant="secondary">Suggested</Badge>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Observed Outcomes</h2>
        <div className="space-y-3">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
            <p className="text-sm text-gray-900 dark:text-gray-100">Active participation in group discussion</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Oct 8, 2026 • Participation</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
