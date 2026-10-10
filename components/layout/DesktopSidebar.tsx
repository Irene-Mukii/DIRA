import Image from "next/image";
import Link from "next/link";

const navigation = [
  { name: "This Week", href: "/this-week", current: false },
  { name: "Follow-up Activity", href: "/follow-up-calls", current: false },
  { name: "Learners", href: "/learners", current: false },
  { name: "Try This", href: "/try-this/demo", current: false },
  { name: "Evidence", href: "/evidence/demo", current: false },
  { name: "Log Observation", href: "/observation-log", current: false },
];

export default function DesktopSidebar() {
  return (
    <div className="hidden md:flex md:w-64 md:flex-col h-full rounded-lg">
      <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center px-4 py-6 rounded-t-lg">
          <Link href="/" className="flex items-center gap-x-2">
            <Image src="/images/logo.png" alt="DIRA" width={40} height={40} />
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">DIRA</span>
          </Link>
        </div>
        <nav className="flex flex-col items-center space-y-1 px-2 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="w-full max-w-[200px] flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white text-center"
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-4 py-4 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-600"></div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Teacher Name</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Class Teacher</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
