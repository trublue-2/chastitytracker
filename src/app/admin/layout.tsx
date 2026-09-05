import AdminHeader from "@/app/AdminHeader";
import AdminBottomNav from "@/app/components/AdminBottomNav";
import AdminDesktopSidebar from "@/app/components/AdminDesktopSidebar";
import ThemeRootSync from "@/app/components/ThemeRootSync";
import AutoRefresh from "@/app/components/AutoRefresh";
import { auth } from "@/lib/auth";
import { ownTrackerHidden } from "@/lib/ownTracker";
import { keyholderWorld } from "@/lib/theme";
import pkg from "../../../package.json";
import { adminShellColCls } from "@/app/components/inputStyles";
import ChangeoverNoticeGate from "@/app/components/ChangeoverNoticeGate";

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
    // Immer Indigo — der Keyholder-Bereich hat keinen eigenen Zustand, und den der Träger trägt er
    // als Akzent je Zeile. Kein `suppressHydrationWarning` mehr: das Attribut ist serverseitig
    // endgültig, wo es früher ein Vorabwert war, den ein Inline-Skript aus `localStorage` korrigierte.
    <div id="admin-root" data-theme={keyholderWorld()} className="world-glow min-h-screen bg-background text-foreground">
      <ThemeRootSync world={keyholderWorld()} />
      {/* Hält die zeit-abgeleiteten Zustände der Keyholder-Sichten (überfällig/abgelaufen,
          Sortierung, Alarm-Zähler) frisch — /admin und /admin/users/[id] sind server-gerendert. */}
      <AutoRefresh />
      <AdminHeader username={user?.name ?? ""} actor={user} hideOwnTracker={hideOwnTracker} />
      <AdminDesktopSidebar version={pkg.version} isGlobalAdmin={isGlobalAdmin} hideOwnTracker={hideOwnTracker} />

      {/* Content — die Spalte kommt von HIER, Begründung in `dashboard/layout.tsx`.

          Im Keyholder-Bereich ist BREIT der Normalfall: seine Zeilen tragen Bild, Beschriftung und
          Aktionsmenü. Die Ausnahme ist das Formular, und die hat einen Namen statt einer Regel —
          `AdminActionFormShell` verengt auf das Lesemass, innerhalb dieser Spalte. */}
      {/* `2xl:pr-64` spiegelt die Breite der Seitenleiste auf die andere Seite, damit die Spalte in
          der Mitte des FENSTERS liegt statt mittig im Bereich NEBEN der Leiste — fürs Auge zählt
          die Leiste mit, und der Inhalt wirkt sonst nach rechts geschoben.

          Die Hülle ist `adminShellColCls` (1024 px): sie fasst die neun Reiter der Träger-Seite in
          EINE Zeile und gibt den Übersichtslisten Raum. Der DETAIL-Inhalt einer Träger-Seite wird
          im Träger-Layout wieder auf `wideColCls` (768) gekappt — die Reiter- und Kopfzeile behalten
          die volle Breite, die Zeilen darunter das Lesemass. */}
      <div className="lg:ml-64 2xl:pr-64 min-h-screen pb-[var(--bottom-nav-space)] lg:pb-0">
        <div className={`${adminShellColCls} [--block-col:100%] [--block-gutter:0px]`}>
          {/* Siehe `dashboard/layout.tsx` — und ebenfalls INNERHALB der Spalte. */}
          {user?.id && <ChangeoverNoticeGate userId={user.id} />}
          {children}
        </div>
      </div>

      <AdminBottomNav version={pkg.version} isGlobalAdmin={isGlobalAdmin} hideOwnTracker={hideOwnTracker} />
    </div>
  );
}
