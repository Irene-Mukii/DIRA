import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

const learners = [
  { id: "1", name: "John Doe", grade: "Grade 5", lastObserved: "2 days ago", status: "Needs observation" },
  { id: "2", name: "Sarah Smith", grade: "Grade 5", lastObserved: "1 week ago", status: "Needs observation" },
  { id: "3", name: "Michael Johnson", grade: "Grade 5", lastObserved: "3 days ago", status: "Recent" },
];

export default function LearnersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Learners</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage and observe your learners</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {learners.map((learner) => (
          <Card key={learner.id} className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{learner.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{learner.grade}</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Last observed</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{learner.lastObserved}</p>
                </div>
                <Badge variant={learner.status === "Recent" ? "secondary" : "default"}>
                  {learner.status}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1">
                  <Link href={`/learners/${learner.id}`} className="w-full">
                    View
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  <Link href={`/learners/${learner.id}/log-observation`} className="w-full">
                    Observe
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
