import { getTranslations, getLocale } from "next-intl/server";
import { APP_TZ, toDateLocale } from "@/lib/utils";
import { entriesCached, hasWeightDataCached, userRowCached } from "@/lib/dashboardData";
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
export default async function StatsMain({ userId, surface, heading, backHref, backLabel }: {
  userId: string;
  /** Wessen Sicht das ist. Bestimmt, welche Konfiguration gilt — die des Betrachters. */
  surface: "subStats" | "keyholderStats";
  heading?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const now = new Date();
  const [t, tc, ta, locale, user, entries, hasWeight] = await Promise.all([
    getTranslations("stats"), getTranslations("common"), getTranslations("admin"),
    getLocale(),
    // Die Zone des TRÄGERS regiert jede Tagesgrenze und jede Formatierung — ob er sich selbst
    // ansieht oder die Keyholderin ihn.
    userRowCached(userId),
    entriesCached(userId),
    hasWeightDataCached(userId),
  ]);

  const pageHeading = heading ?? t("title");
  // KEINE eigene Spalte und KEINE eigene Landmarke.
  //
  // Beides kommt von aussen, seit die Bereichs-Layouts das Mass setzen (#77): `/dashboard/stats`
  // erbt das Lesemass, der Keyholder-Reiter die breite Spalte. Vorher wählte diese Komponente
  // selbst zwischen zwei Breiten — und legte damit auf `/dashboard/stats` einen zweiten Seitenrand
  // in den ersten (gemessen: 16 px innen, Inhalt 608 statt 640 px breit) und im Keyholder-Reiter
  // ein zweites `<main>` in das des Layouts.
  //
  // Ein Bauteil, das an zwei Orten hängt, soll seine Umgebung nicht raten müssen: es füllt, was da
  // ist.
  const wrapper = "flex-1 py-6 flex flex-col gap-6";

  // Ohne einen einzigen Eintrag hat die Seite nichts zu zeigen — und keiner ihrer Blöcke etwas zu
  // laden. Der Leer-Zustand steht deshalb VOR dem Stapel.
  //
  // „Keine Einträge" heisst aber nicht mehr „nichts zu zeigen": wer nur sein Gewicht führt und nie
  // etwas verschlossen hat, hat sehr wohl eine Statistik.
  if (entries.length === 0 && !hasWeight) {
    return (
      <div className={wrapper}>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        <h1 className="text-xl font-bold text-foreground">{pageHeading}</h1>
        <Card padding="default">
          <EmptyState icon={<BarChart2 size={32} />} title={t("noEntries")} />
        </Card>
      </div>
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
    <div className={wrapper}>
      <BlockStack layout={layout} nodes={nodes} />
    </div>
  );
}
