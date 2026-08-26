import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { APP_TZ, toDateLocale } from "@/lib/utils";
import { viewerLayout } from "@/lib/viewerLayout";
import { renderStack } from "@/lib/blockStack";
import BlockStack from "@/app/components/BlockStack";
import { SUB_DASHBOARD_BLOCK_TABLE, type SubDashboardCtx } from "./dashboardBlocks";

/**
 * Das Träger-Dashboard.
 *
 * Die Seite lädt selbst nichts mehr ausser dem, was ALLE Blöcke gemeinsam brauchen (wer, wann, in
 * welcher Zone und Sprache) und der Konfiguration, die entscheidet, welche Blöcke überhaupt
 * entstehen. Die Daten hängen seit Etappe B an den Blöcken (`dashboardBlocks.tsx`), geteilt über
 * die `cache()`-Schicht in `dashboardData.ts`.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const now = new Date();

  // Erst die Konfiguration: sie entscheidet, welche Loader überhaupt laufen. Die Benutzerzeile, aus
  // der sie kommt, ist dieselbe, die die Blöcke gleich weiterverwenden — sie kostet also nichts
  // Zusätzliches. `userId` mitgeben, damit `auth()` nicht ein zweites Mal läuft.
  const [layout, t, tOrgasm, tTasks, tNav, locale] = await Promise.all([
    viewerLayout("subDashboard", userId),
    getTranslations("dashboard"),
    getTranslations("orgasmForm"),
    getTranslations("tasks"),
    getTranslations("nav"),
    getLocale(),
  ]);

  const ctx: SubDashboardCtx = {
    userId,
    username: session.user.name ?? "",
    now,
    nowMs: now.getTime(),
    tz: session.user.timezone ?? APP_TZ,
    dl: toDateLocale(locale),
    t, tOrgasm, tTasks,
    layout,
  };

  const nodes = await renderStack(layout, ctx, SUB_DASHBOARD_BLOCK_TABLE);

  return (
    // Der Abstand zwischen den Blöcken kommt AUSSCHLIESSLICH von diesem `gap-4`, nie aus pt-/pb- der
    // Blöcke selbst — Begründung in `DashboardBlock`.
    //
    // Landmarke und Überschrift stehen HIER und nicht in einem Block. Beide hingen zuvor an
    // `statusAndStats` (`DashboardClient` mit `as="main"`), und der ist abschaltbar: wer ihn unter
    // „Dashboard anpassen" ausblendet, hatte danach eine Übersicht ganz ohne Hauptbereich — der
    // Sprunglink zeigte ins Leere, und die Fokus-Rückgabe der Dialoge fand kein Ziel mehr. Dieselbe
    // Fehlerklasse wie bei den Fristen in ausblendbaren Blöcken: was das Gerüst der Seite trägt,
    // darf nicht Teil ihres Inhalts sein. Der statische Wächter in `pageMeasures.test.ts` sieht das
    // nicht, weil er die Datei liest und nicht die gespeicherte Konfiguration.
    <main className="flex flex-col gap-4 py-6">
      {/* Unsichtbar, weil dieser Entwurf die Übersicht bewusst ohne Titelzeile beginnen lässt — der
          erste Block ist die Antwort, nicht ein Etikett darüber. Ohne sie begänne die
          Überschriftenliste auf Ebene 2 (jeder `BlockHeading` ist ein `h2`): eine Gliederung ohne
          Wurzel, und keine Ansage, auf welchem Bildschirm man steht. Der Text kommt aus dem
          Navigations-Eintrag dieser Seite — Reiter und Überschrift MÜSSEN dasselbe sagen. */}
      <h1 className="sr-only">{tNav("overview")}</h1>
      <BlockStack layout={layout} nodes={nodes} />
    </main>
  );
}
