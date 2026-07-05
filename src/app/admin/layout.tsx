import AdminHeader from "@/app/AdminHeader";
import AdminBottomNav from "@/app/components/AdminBottomNav";
import AdminDesktopSidebar from "@/app/components/AdminDesktopSidebar";
import ThemeApplicator from "@/app/components/ThemeApplicator";
import { auth } from "@/lib/auth";
import { getThemeInitScript } from "@/lib/themeScript";
import pkg from "../../../package.json";

// SECURITY: admin-only, user-spezifisch — nie statisch/geteilt cachen (per-Request inkl. RSC).
// Gleiche Härtung wie das Dashboard-Layout gegen vorgeschaltete Shared-Caches.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const isGlobalAdmin = user?.role === "admin";

  return (
    <div id="admin-root" data-theme="admin" className="min-h-screen bg-background text-foreground">
      <script dangerouslySetInnerHTML={{ __html: getThemeInitScript("admin") }} />
      <ThemeApplicator role="admin" />
      <AdminHeader username={user?.name ?? ""} isGlobalAdmin={isGlobalAdmin} />
      <AdminDesktopSidebar version={pkg.version} isGlobalAdmin={isGlobalAdmin} />

      {/* Content */}
      <div className="lg:ml-64 min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>

      <AdminBottomNav version={pkg.version} isGlobalAdmin={isGlobalAdmin} />
    </div>
  );
}
