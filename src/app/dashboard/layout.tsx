import Header from "@/app/Header";
import DesktopSidebar from "@/app/components/DesktopSidebar";
import InstallBanner from "@/app/components/InstallBanner";
import OfflineIndicator from "@/app/components/OfflineIndicator";
import ThemeApplicator from "@/app/components/ThemeApplicator";
import DashboardBottomNav from "./DashboardBottomNav";
import { auth } from "@/lib/auth";
import { getIsLocked } from "@/lib/queries";
import { formatBuildDate } from "@/lib/utils";
import { getThemeInitScript } from "@/lib/themeScript";
import pkg from "../../../package.json";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const userId = user?.id;

  const buildDate = formatBuildDate();

  const isLocked = userId ? await getIsLocked(userId) : false;

  return (
    <div className="min-h-screen bg-background" data-theme="user">
      <script dangerouslySetInnerHTML={{ __html: getThemeInitScript("user") }} />
      <ThemeApplicator role="user" />
      <Header />
      <DesktopSidebar
        isAdmin={user?.role === "admin"}
        isLocked={isLocked}
        version={pkg.version}
        buildDate={buildDate}
      />

      {/* Content area: offset for sidebar on desktop, offset for bottom nav on mobile */}
      <div className="lg:ml-64 min-h-[calc(100vh-3.5rem)] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 overscroll-y-contain">
        <div className="w-full max-w-2xl mx-auto px-4">
          <OfflineIndicator />
        </div>
        {children}
      </div>

      <DashboardBottomNav
        isAdmin={user?.role === "admin"}
        isLocked={isLocked}
        version={pkg.version}
        buildDate={buildDate}
      />
      <InstallBanner />
    </div>
  );
}
