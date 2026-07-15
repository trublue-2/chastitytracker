import Header from "@/app/Header";
import DesktopSidebar from "@/app/components/DesktopSidebar";
import InstallBanner from "@/app/components/InstallBanner";
import OfflineIndicator from "@/app/components/OfflineIndicator";
import ThemeApplicator from "@/app/components/ThemeApplicator";
import DashboardBottomNav from "./DashboardBottomNav";
import BottomNavSpacer from "./BottomNavSpacer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIsLocked, getActiveWearSessions } from "@/lib/queries";
import { deviceCategoriesEnabled, bildersafeEnabled } from "@/lib/constants";
import { getThemeInitScript } from "@/lib/themeScript";
import pkg from "../../../package.json";
import type { NewEntryCategoryRow } from "@/app/components/NewEntrySheet";

// SECURITY: user-spezifisch (auth() → Rolle/Avatar/Daten). Nie statisch/geteilt cachen — erzwingt
// per-Request-Rendering inkl. der RSC-Navigations-Payloads. Härtet gegen einen fehlkonfigurierten
// vorgeschalteten Shared-Cache, der sonst die Seite eines Users an einen anderen ausliefern könnte
// (Cross-User-Identity-Leak).
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const userId = user?.id;
  // controlsSubs is cached on the JWT (auth.ts) — same source the proxy uses to gate /admin,
  // so the keyholder nav entry appears exactly when access actually works. No extra DB query.
  const isKeyholder = (user as { controlsSubs?: boolean } | undefined)?.controlsSubs ?? false;

  const flagOn = deviceCategoriesEnabled();
  const [isLocked, categories, activeWear] = await Promise.all([
    userId ? getIsLocked(userId) : Promise.resolve(false),
    userId && flagOn
      ? prisma.deviceCategory.findMany({
          where: { userId, isBuiltIn: false, trackingEnabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, color: true, icon: true },
        })
      : Promise.resolve([]),
    userId && flagOn ? getActiveWearSessions(userId) : Promise.resolve([]),
  ]);
  const activeByCategory = new Map(activeWear.map((s) => [s.categoryId, s]));
  const categoryRows: NewEntryCategoryRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    activeDeviceName: activeByCategory.get(c.id)?.deviceName ?? null,
  }));

  return (
    <div className="min-h-screen bg-background" data-theme="user">
      <script dangerouslySetInnerHTML={{ __html: getThemeInitScript("user") }} />
      <ThemeApplicator role="user" />
      <Header />
      <DesktopSidebar
        isAdmin={user?.role === "admin"}
        isKeyholder={isKeyholder}
        isLocked={isLocked}
        version={pkg.version}
        categoryRows={categoryRows}
        bildersafe={bildersafeEnabled()}
      />

      {/* Content area: offset for sidebar on desktop. Der Platz für die fixe Bottom-Nav (Mobile)
          kommt vom BottomNavSpacer am Fluss-Ende — er entfällt auf den Erfassungs-Seiten, wo die Nav
          ausgeblendet ist, sodass sich dort ihr Platz nicht mit dem der fixen Aktionsleiste stapelt. */}
      <div className="lg:ml-64 min-h-[calc(100vh-3.5rem)] overscroll-y-contain">
        <div className="w-full max-w-2xl mx-auto px-4">
          <OfflineIndicator />
        </div>
        {children}
        <BottomNavSpacer />
      </div>

      <DashboardBottomNav
        isAdmin={user?.role === "admin"}
        isKeyholder={isKeyholder}
        isLocked={isLocked}
        version={pkg.version}
        categoryRows={categoryRows}
        bildersafe={bildersafeEnabled()}
      />
      <InstallBanner />
    </div>
  );
}
