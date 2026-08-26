import AdminHeader from "@/app/AdminHeader";
import AdminBottomNav from "@/app/components/AdminBottomNav";
import AdminDesktopSidebar from "@/app/components/AdminDesktopSidebar";
import ThemeApplicator from "@/app/components/ThemeApplicator";
import { auth } from "@/lib/auth";
import { ownTrackerHidden } from "@/lib/ownTracker";
import { getThemeInitScript } from "@/lib/themeScript";
import pkg from "../../../package.json";
import { wideColCls } from "@/app/components/inputStyles";

// SECURITY: admin-only, user-spezifisch — nie statisch/geteilt cachen (per-Request inkl. RSC).
// Gleiche Härtung wie das Dashboard-Layout gegen vorgeschaltete Shared-Caches.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const isGlobalAdmin = user?.role === "admin";
  // "Kein eigener Tracker": blendet den "Meine Sicht"-Nav-Eintrag aus. NICHT mehr die Glocke — die
  // meint im Admin-Bereich den Keyholder-Posteingang, und der gehört auch dieser Person.
  const hideOwnTracker = await ownTrackerHidden(user);

  return (
    // suppressHydrationWarning gilt NUR für die Attribute dieses einen Elements (nicht für Kinder)
    // und genau dafür ist es hier da: das Inline-Skript unten setzt `data-theme` aus localStorage,
    // BEVOR React hydriert. Der Server kann diesen Wert nicht kennen, also weicht das gerenderte
    // Attribut planmässig ab — React meldete das bisher als Hydration-Fehler („data-theme='admin'
    // vs 'admin-light'"). Beim Admin schlug das bei JEDEM hellen Aufruf zu, weil das serverseitige
    // `admin` das DUNKLE Theme ist und das Skript auf `admin-light` korrigiert.
    <div id="admin-root" data-theme="admin" suppressHydrationWarning className="min-h-screen bg-background text-foreground">
      <script dangerouslySetInnerHTML={{ __html: getThemeInitScript("admin") }} />
      <ThemeApplicator role="admin" />
      <AdminHeader username={user?.name ?? ""} actor={user} hideOwnTracker={hideOwnTracker} />
      <AdminDesktopSidebar version={pkg.version} isGlobalAdmin={isGlobalAdmin} hideOwnTracker={hideOwnTracker} />

      {/* Content — die Spalte kommt von HIER, Begründung in `dashboard/layout.tsx`.

          Im Keyholder-Bereich ist BREIT der Normalfall: seine Zeilen tragen Bild, Beschriftung und
          Aktionsmenü. Die Ausnahme ist das Formular, und die hat einen Namen statt einer Regel —
          `AdminActionFormShell` verengt auf das Lesemass, innerhalb dieser Spalte. */}
      <div className="lg:ml-64 min-h-screen pb-[var(--bottom-nav-space)] lg:pb-0">
        <div className={`${wideColCls} [--block-col:100%] [--block-gutter:0px]`}>
          {children}
        </div>
      </div>

      <AdminBottomNav version={pkg.version} isGlobalAdmin={isGlobalAdmin} hideOwnTracker={hideOwnTracker} />
    </div>
  );
}
