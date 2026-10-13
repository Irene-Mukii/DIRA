import AppHeader from "./AppHeader";
import DesktopSidebar from "./DesktopSidebar";
import MobileBottomNav from "./MobileBottomNav";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full gap-4 overflow-hidden bg-gray-50 p-4 dark:bg-gray-900">
      <DesktopSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg">
        <AppHeader />
        <main className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg pb-20 md:mt-0 md:pb-0">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
