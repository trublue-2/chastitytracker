import AdminHeader from "@/app/AdminHeader";
import AdminBottomNav from "@/app/components/AdminBottomNav";
import AdminDesktopSidebar from "@/app/components/AdminDesktopSidebar";
import { auth } from "@/lib/auth";
import { formatBuildDate } from "@/lib/utils";
import pkg from "../../../package.json";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const buildDate = formatBuildDate();

  return (
    <div data-theme="admin" className="min-h-screen bg-background text-foreground">
      <AdminHeader username={user?.name ?? ""} />
      <AdminDesktopSidebar version={pkg.version} buildDate={buildDate} />

      {/* Content */}
      <div className="sm:ml-60 min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-0">
        {children}
      </div>

      <AdminBottomNav version={pkg.version} buildDate={buildDate} />
    </div>
  );
}
