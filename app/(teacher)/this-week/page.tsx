import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

const learners = [
  { id: "1", name: "John Doe", lastObserved: "2 days ago" },
  { id: "2", name: "Sarah Smith", lastObserved: "1 week ago" },
  { id: "3", name: "Michael Johnson", lastObserved: "3 days ago" },
];

export default function ThisWeekPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">This Week</h1>
        <p className="text-gray-500 dark:text-gray-400">Learners who need your attention this week</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Learners needing observation</h2>
        <div className="space-y-4">
          {learners.map((learner) => (
            <div key={learner.id} className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0 last:pb-0">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{learner.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Last observed: {learner.lastObserved}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline-solid">
                  <Link href={`/learners/${learner.id}`}>View</Link>
                </Button>
                <Button size="sm">
                  <Link href={`/learners/${learner.id}/log-observation`}>Observe</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
