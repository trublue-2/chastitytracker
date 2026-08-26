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
export default async function StatsMain({ userId, surface, heading, backHref, backLabel, as: Tag = "div" }: {
  userId: string;
  /** Wessen Sicht das ist. Bestimmt, welche Konfiguration gilt — die des Betrachters. */
  surface: "subStats" | "keyholderStats";
  heading?: string;
  backHref?: string;
  backLabel?: string;
  /**
   * Welches Element die Fassung aufspannt.
   *
   * `div` ist die Vorgabe, weil diese Komponente an ZWEI Orten hängt: als Reiter im
   * Keyholder-Bereich liegt sie in dem `<main>`, das `admin/users/[id]/layout.tsx` schon rendert —
   * ein zweites darin wären zwei Landmarken desselben Typs, und „Hauptbereich" würde für einen
   * Screenreader zur Frage statt zur Antwort.
   *
   * Auf `/dashboard/stats` ist sie dagegen die ganze Seite, und `dashboard/layout.tsx` setzt keine
   * Landmarke. Dort stand deshalb gar keine — auffällig nur daneben: das SKELETT der Seite hatte
   * eins, die fertige Seite nicht.
   */
  as?: "div" | "main";
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
  // KEINE eigene Spalte — und die Landmarke nur auf Ansage (`as="main"`).
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
      <Tag className={wrapper}>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        {Tag === "main"
          ? <h1 className="text-xl font-bold text-foreground">{pageHeading}</h1>
          : <h2 className="text-xl font-bold text-foreground">{pageHeading}</h2>}
        <Card padding="default">
          <EmptyState icon={<BarChart2 size={32} />} title={t("noEntries")} />
        </Card>
      </Tag>
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
    // Dieselbe Frage, die `as` schon beantwortet: wer die Landmarke aufspannt, schreibt auch die
    // Ebene-1-Überschrift. Im Keyholder-Reiter tut das Layout beides.
    isLandmark: Tag === "main",
  };

  const nodes = await renderStack(layout, ctx, STATS_BLOCK_TABLE);

  return (
    <Tag className={wrapper}>
      <BlockStack layout={layout} nodes={nodes} />
    </Tag>
  );
}
