import { readingColCls, wideColCls } from "@/app/components/inputStyles";
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
export default async function StatsMain({ userId, surface, heading, backHref, backLabel, column = "wide" }: {
  userId: string;
  /** Wessen Sicht das ist. Bestimmt, welche Konfiguration gilt — die des Betrachters. */
  surface: "subStats" | "keyholderStats";
  heading?: string;
  backHref?: string;
  backLabel?: string;
  /**
   * Welche Spalte diese Fassung aufspannt — oder ob sie gar keine mitbringt.
   *
   * War ein `compact`-Schalter über zwei Breiten, und liess damit den Fall aus, der tatsächlich
   * vorlag: im Keyholder-Bereich liegt die Statistik als Reiter IN einem Layout, das seine Spalte
   * schon gesetzt hat (`admin/users/[id]/layout.tsx`). Die Komponente legte dort eine zweite
   * darüber — Spalte in Spalte, Seitenrand doppelt, `py` doppelt —, und das Skelett daneben hatte
   * keine, sodass der Inhalt beim Austausch um 24 px nach innen sprang.
   *
   * `inherit` ist deshalb kein Sonderfall, sondern die richtige Antwort auf „wer besitzt hier das
   * Mass": die Seite, nicht der Block darin.
   */
  column?: "reading" | "wide" | "inherit";
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
  // Beide eigenen Fassungen tragen ein Lesemass. Die breite stand auf 1024 px und war zusätzlich
  // NICHT zentriert (`max-w-5xl` ohne `mx-auto`), klebte also bei jedem Fenster am linken Rand.
  const spalte = column === "reading" ? `${readingColCls} py-6`
    : column === "wide" ? `${wideColCls} py-8`
    : "";
  const wrapper = `flex-1 ${spalte} flex flex-col gap-6`;
  // Wer die Spalte erbt, erbt auch die Landmarke: im Keyholder-Reiter rendert das Layout schon ein
  // `<main>`, und ein zweites darin macht aus „Hauptbereich" eine Auswahl statt einer Auskunft.
  const Wrapper = column === "inherit" ? "div" : "main";

  // Ohne einen einzigen Eintrag hat die Seite nichts zu zeigen — und keiner ihrer Blöcke etwas zu
  // laden. Der Leer-Zustand steht deshalb VOR dem Stapel.
  //
  // „Keine Einträge" heisst aber nicht mehr „nichts zu zeigen": wer nur sein Gewicht führt und nie
  // etwas verschlossen hat, hat sehr wohl eine Statistik.
  if (entries.length === 0 && !hasWeight) {
    return (
      <Wrapper className={wrapper}>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        <h1 className="text-xl font-bold text-foreground">{pageHeading}</h1>
        <Card padding="default">
          <EmptyState icon={<BarChart2 size={32} />} title={t("noEntries")} />
        </Card>
      </Wrapper>
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
    <Wrapper className={wrapper}>
      <BlockStack layout={layout} nodes={nodes} />
    </Wrapper>
  );
}
