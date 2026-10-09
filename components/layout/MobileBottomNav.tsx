import Link from "next/link";

const navigation = [
  { name: "This Week", href: "/this-week", icon: "📅" },
  { name: "Learners", href: "/learners", icon: "👥" },
  { name: "Observe", href: "/observation-log", icon: "✏️" },
  { name: "Evidence", href: "/evidence/demo", icon: "📄" },
];

export default function MobileBottomNav() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-2 py-1">
      <nav className="flex justify-around">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="flex flex-col items-center py-2 px-3 text-xs text-gray-700 dark:text-gray-300"
          >
            <span className="text-lg mb-1">{item.icon}</span>
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
