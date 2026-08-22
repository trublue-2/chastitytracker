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
  const [layout, t, tOrgasm, tTasks, locale] = await Promise.all([
    viewerLayout("subDashboard", userId),
    getTranslations("dashboard"),
    getTranslations("orgasmForm"),
    getTranslations("tasks"),
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
    <div className="flex flex-col gap-4 py-6">
      <BlockStack layout={layout} nodes={nodes} />
    </div>
  );
}
