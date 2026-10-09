import Image from "next/image";
import Link from "next/link";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-x-4 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 shadow-sm sm:px-6 lg:px-8 md:hidden rounded-lg mt-2 mb-2">
      <div className="flex flex-1 items-center justify-between">
        <div className="flex items-center gap-x-4">
          <Link href="/" className="flex items-center gap-x-2">
            <Image src="/images/logo.png" alt="DIRA" width={32} height={32} />
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">DIRA</span>
          </Link>
        </div>
        <div className="flex items-center gap-x-4">
          <button className="rounded-full bg-gray-200 dark:bg-gray-700 p-2">
            <span className="sr-only">Notifications</span>
            <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          <div className="flex items-center gap-x-2">
            <div className="h-8 w-8 rounded-full bg-blue-600"></div>
            <span className="hidden md:block text-sm font-medium text-gray-900 dark:text-gray-100">Teacher</span>
          </div>
        </div>
      </div>
    </header>
  );
}
