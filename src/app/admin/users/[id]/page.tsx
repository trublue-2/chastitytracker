import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { APP_TZ, formatDateTimeDual, toDateLocale } from "@/lib/utils";
import { userRowCached } from "@/lib/dashboardData";
import { renderStack } from "@/lib/blockStack";
import { viewerLayout } from "@/lib/viewerLayout";
import BlockStack from "@/app/components/BlockStack";
import { KEYHOLDER_SUB_BLOCK_TABLE, type KeyholderSubCtx } from "./keyholderSubBlocks";

/**
 * Die Detailseite eines Trägers, wie die Keyholderin sie sieht — ihr Gegenstück zu seinem
 * Dashboard.
 *
 * Die Seite lädt selbst nur, was ALLE Blöcke gemeinsam brauchen: wer angesehen wird, wer zusieht,
 * und in welchen zwei Zeitzonen das zu lesen ist. Die Daten hängen an den Blöcken
 * (`keyholderSubBlocks.tsx`), geteilt über die `cache()`-Schicht in `dashboardData.ts`.
 */
export default async function AdminUserOverview({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const now = new Date();
  const [t, ts, td, tc, tOrgasm, tTasks, locale, user] = await Promise.all([
    getTranslations("admin"), getTranslations("stats"), getTranslations("dashboard"),
    getTranslations("common"), getTranslations("orgasmForm"), getTranslations("tasks"),
    getLocale(),
    userRowCached(id),
  ]);
  if (!user) return <div className="p-8 text-foreground-faint">{t("userNotFound")}</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}`);

  const dl = toDateLocale(locale);
  const subjectTz = user.timezone ?? APP_TZ;
  // Betrachter-Zeitzone (Keyholder): Zeit-Widgets primär in dieser tz, Sub-Lokalzeit als Zusatz bei
  // Abweichung. Die Zone des Subs bleibt die Basis; `subLabel` beschriftet den Zusatz.
  const viewerTz = session?.user?.timezone ?? APP_TZ;
  const subLabel = t("subTimePrefix");

  const ctx: KeyholderSubCtx = {
    subjectId: id,
    now,
    nowMs: now.getTime(),
    subjectTz,
    viewerTz,
    dl,
    subLabel,
    fmtDual: (d: Date) => formatDateTimeDual(d, dl, viewerTz, subjectTz, subLabel),
    t, ts, td, tc, tOrgasm, tTasks,
  };

  // Die Konfiguration der KEYHOLDERIN, nicht die des angezeigten Trägers.
  const layout = await viewerLayout("keyholderSub", session?.user?.id);
  const nodes = await renderStack(layout, ctx, KEYHOLDER_SUB_BLOCK_TABLE);

  return <BlockStack layout={layout} nodes={nodes} />;
}
