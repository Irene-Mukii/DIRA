import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export default function TryThisPage({ params }: { params: { learnerId: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Try This</h1>
        <p className="text-gray-500 dark:text-gray-400">Suggested activities for Learner {params.learnerId}</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Suggested Classroom Activity</h2>
            <Badge>Suggested</Badge>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Exploration Question</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">How can we encourage more active participation in group discussions?</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Activity</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Use think-pair-share strategy. Have learner pair up, think for 2 minutes, share with partner, then share with group.</p>
          </div>
          <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>⏱️ ~10 minutes</span>
            <span>👥 Small group</span>
          </div>
          <div className="flex gap-2 pt-4">
            <Button className="flex-1">I'll try this</Button>
            <Button variant="outline-solid" className="flex-1">Not yet</Button>
            <Button variant="outline-solid" className="flex-1">Suggest another</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
