import Header from "@/app/Header";
import DesktopSidebar from "@/app/components/DesktopSidebar";
import InstallBanner from "@/app/components/InstallBanner";
import OfflineIndicator from "@/app/components/OfflineIndicator";
import ThemeRootSync from "@/app/components/ThemeRootSync";
import DashboardBottomNav from "./DashboardBottomNav";
import BottomNavSpacer from "./BottomNavSpacer";
import { auth } from "@/lib/auth";
import { getIsLocked } from "@/lib/queries";
import { subVisibleInspectionsNow } from "@/lib/dashboardData";
import { pendingInspection } from "@/lib/entryFormRoute";
import { buildNewEntryCategoryRows } from "@/lib/categoryRows";
import { bildersafeEnabled, weightTrackingEnabled } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { subWorld } from "@/lib/theme";
import pkg from "../../../package.json";
import { readingColCls } from "@/app/components/inputStyles";
import ChangeoverNoticeGate from "@/app/components/ChangeoverNoticeGate";

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

  const [isLocked, categoryRows, weightUser, inspections] = await Promise.all([
    userId ? getIsLocked(userId) : Promise.resolve(false),
    userId ? buildNewEntryCategoryRows(userId) : Promise.resolve([]),
    // Die (+)-Zeile „Gewicht" erscheint nur, wenn BEIDE Schalter stehen. Nur gefragt, wenn die
    // Instanz das Feature überhaupt führt — sonst ist die Antwort ohnehin bekannt.
    userId && weightTrackingEnabled()
      ? prisma.user.findUnique({ where: { id: userId }, select: { weightTrackingEnabled: true } })
      : Promise.resolve(null),
    // Die offenen Kontroll-Anforderungen — für die (+)-Zeile, die sonst einen NEUEN Code würfelt
    // und die anstehende Anforderung unbeantwortet lässt. Sie gehört ins Layout, weil der (+) auf
    // JEDER Dashboard-Seite steht.
    //
    // Über `…Now` und nicht mit eigenem `Date.now()`: die Abfrage ist auf den Zeitpunkt
    // memoisiert, zwei verschiedene Zeitpunkte lösen also zwei identische Abfragen aus. Mit dem
    // gemeinsamen Zeitpunkt teilt sich das Layout die Abfrage mit dem Alarm-Block der Übersicht —
    // dort, wo sie ohnehin läuft, kostet sie nichts.
    userId ? subVisibleInspectionsNow(userId) : Promise.resolve([]),
  ]);
  const weight = !!weightUser?.weightTrackingEnabled;

  const openInspection = pendingInspection(inspections);

  return (
    // Die Welt kommt aus dem Verschluss-Zustand, den dieses Layout ohnehin schon lädt — kein
    // `suppressHydrationWarning` mehr, weil der Server den Wert jetzt KENNT. Vorher stand hier ein
    // Inline-Skript, das ihn vor der Hydration aus `localStorage` nachtrug; das war nötig, solange
    // die Welt eine Einstellung war, und ist der Grund, warum sie am Handy eine andere sein konnte
    // als am Rechner.
    <div className="world-glow min-h-screen bg-background" data-theme={subWorld(isLocked)}>
      <ThemeRootSync world={subWorld(isLocked)} />
      <Header />
      <DesktopSidebar
        isAdmin={user?.role === "admin"}
        isKeyholder={isKeyholder}
        isLocked={isLocked}
        version={pkg.version}
        categoryRows={categoryRows}
        bildersafe={bildersafeEnabled()}
        weight={weight}
        openInspection={openInspection}
      />

      {/* Content area: offset for sidebar on desktop. Der Platz für die fixe Bottom-Nav (Mobile)
          kommt vom BottomNavSpacer am Fluss-Ende — er entfällt auf den Erfassungs-Seiten, wo die Nav
          ausgeblendet ist, sodass sich dort ihr Platz nicht mit dem der fixen Aktionsleiste stapelt. */}
      {/* **Die Spalte gehört HIERHER, nicht auf jede Seite.**

          Sie stand zwanzigmal von Hand in den Seiten darunter — erst als vier verschiedene Masse,
          dann (seit dem Desktop-Durchgang) als zwanzigmal dieselbe Konstante. Auch das ist noch
          eine Regel, die man vergessen kann: eine neue Seite, die den Import unterlässt, läuft
          über die volle Fensterbreite, und niemand merkt es beim Bauen — auf dem Handy fällt die
          Frage gar nicht an.

          `--block-col`/`--block-gutter` werden dabei neutralisiert: `DashboardBlock` bringt sonst
          seine eigene Spalte MIT in eine, die es schon gibt, und jeder geteilte Block sässe
          doppelt eingerückt zwischen seinen Nachbarn. Dasselbe Paar setzt schon
          `admin/users/[id]/layout.tsx` — das war das Vorbild, hier ist es die Regel. */}
      {/* `xl:pr-64` spiegelt die Breite der Seitenleiste auf die andere Seite.

          Ohne sie zentriert sich die Spalte im Bereich NEBEN der Leiste — gemessen bei 1440 px:
          272 px links, 272 px rechts, rechnerisch also mittig. Fürs Auge zählt die Leiste aber mit,
          und dann stehen links 528 px gegen rechts 272 px: der Inhalt wirkt nach rechts geschoben.
          Mit dem gespiegelten Rand liegt die Spalte in der Mitte des FENSTERS.

          Erst ab `xl`, nicht ab `lg`: bei 1024 px blieben sonst 512 px für eine 672-px-Spalte übrig,
          und sie würde schmaler statt mittiger. Ab 1280 px passt beides. */}
      <div className="lg:ml-64 xl:pr-64 min-h-[calc(100vh-3.5rem)] overscroll-y-contain">
        <div className={`${readingColCls} [--block-col:100%] [--block-gutter:0px]`}>
          {/* Im LAYOUT und nicht auf der Übersichtsseite: `landing.ts` kennt fünf Einstiege, und
              zwei davon führen an der Übersicht vorbei — eine Keyholderin mit genau einem Sub
              landet direkt auf dessen Detailseite. Hier erreicht der Hinweis jeden, und weil er
              sich pro Person merkt, dass er gelesen wurde, steht er trotzdem nur einmal da.
              INNERHALB der Spalte: davor lief er von Bildschirmkante zu Bildschirmkante und
              ignorierte den Versatz der Seitenleiste (Issue #87). */}
          {userId && <ChangeoverNoticeGate userId={userId} />}
          <OfflineIndicator />
          {children}
        </div>
        <BottomNavSpacer />
      </div>

      <DashboardBottomNav
        isAdmin={user?.role === "admin"}
        isKeyholder={isKeyholder}
        isLocked={isLocked}
        version={pkg.version}
        categoryRows={categoryRows}
        bildersafe={bildersafeEnabled()}
        weight={weight}
        openInspection={openInspection}
      />
      <InstallBanner />
    </div>
  );
}
