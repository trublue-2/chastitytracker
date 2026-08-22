import { getTranslations, getLocale } from "next-intl/server";
import { APP_TZ, toDateLocale } from "@/lib/utils";
import { entriesCached, userRowCached } from "@/lib/dashboardData";
import { renderStack } from "@/lib/blockStack";
import { viewerLayout } from "@/lib/viewerLayout";
import BlockStack from "@/app/components/BlockStack";
import { STATS_BLOCK_TABLE, type StatsCtx } from "@/app/components/statsBlocks";
import Card from "./Card";
import EmptyState from "./EmptyState";
import { BarChart2 } from "lucide-react";

/**
 * Die Statistik-Seite — geteilt vom Träger (`/dashboard/stats`) und der Keyholderin
 * (`/admin/users/[id]/stats`).
 *
 * Die Blöcke samt ihrer Datenbeschaffung stehen in `statsBlocks.tsx`; hier bleibt, was beide
 * Sichten gemeinsam haben: wer, wann, in welcher Zone, und der Rahmen drumherum.
 */
export default async function StatsMain({ userId, surface, heading, backHref, backLabel, compact }: {
  userId: string;
  /** Wessen Sicht das ist. Bestimmt, welche Konfiguration gilt — die des Betrachters. */
  surface: "subStats" | "keyholderStats";
  heading?: string;
  backHref?: string;
  backLabel?: string;
  /** Use narrower container (max-w-2xl px-4) for dashboard embedding */
  compact?: boolean;
}) {
  const now = new Date();
  const [t, tc, ta, locale, user, entries] = await Promise.all([
    getTranslations("stats"), getTranslations("common"), getTranslations("admin"),
    getLocale(),
    // Die Zone des TRÄGERS regiert jede Tagesgrenze und jede Formatierung — ob er sich selbst
    // ansieht oder die Keyholderin ihn.
    userRowCached(userId),
    entriesCached(userId),
  ]);

  const pageHeading = heading ?? t("title");
  const wrapper = `flex-1 w-full ${compact ? "max-w-2xl mx-auto px-4 py-6" : "max-w-5xl px-6 py-8"} flex flex-col gap-6`;

  // Ohne einen einzigen Eintrag hat die Seite nichts zu zeigen — und keiner ihrer Blöcke etwas zu
  // laden. Der Leer-Zustand steht deshalb VOR dem Stapel.
  if (entries.length === 0) {
    return (
      <main className={wrapper}>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        <h1 className="text-xl font-bold text-foreground">{pageHeading}</h1>
        <Card padding="default">
          <EmptyState icon={<BarChart2 size={32} />} title={t("noEntries")} />
        </Card>
      </main>
    );
  }

  // Die Konfiguration des BETRACHTERS, nicht die des angezeigten Trägers — `/admin/users/[id]/stats`
  // zeigt einen Sub, zusammengestellt hat die Seite aber die Keyholderin für sich.
  const layout = await viewerLayout(surface);

  const ctx: StatsCtx = {
    userId,
    now,
    nowMs: now.getTime(),
    tz: user?.timezone ?? APP_TZ,
    dl: toDateLocale(locale),
    t, tc, ta,
    heading: pageHeading, backHref, backLabel,
  };

  const nodes = await renderStack(layout, ctx, STATS_BLOCK_TABLE);

  return (
    <main className={wrapper}>
      <BlockStack layout={layout} nodes={nodes} />
    </main>
  );
}
