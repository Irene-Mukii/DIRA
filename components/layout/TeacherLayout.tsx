import AppHeader from "./AppHeader";
import DesktopSidebar from "./DesktopSidebar";
import MobileBottomNav from "./MobileBottomNav";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full h-screen bg-gray-50 dark:bg-gray-900 gap-4 p-4">
      <DesktopSidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 rounded-lg">
        <AppHeader />
        <main className="flex-1 overflow-hidden mt-2 md:mt-0 rounded-lg">{children}</main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
