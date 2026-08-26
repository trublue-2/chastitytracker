"use client";

import { useTranslations } from "next-intl";
import { blockInsetCls } from "@/app/components/inputStyles";

/**
 * Die Blätter-Zeile unter einer Listen-Karte — „← Zurück · 2 / 7 · Weiter →".
 *
 * Extrahiert, weil dieselben zwanzig Zeilen samt Klassen und `disabled`-Logik in mehreren
 * Dashboard-Listen wortgleich standen: eine Änderung an der Fusszeile war eine Änderung an allen.
 * Der Zustand bleibt beim Aufrufer — er besitzt die Liste, wir zeigen nur, wo man steht.
 */
export default function ListPager({
  page,
  totalPages,
  onPage,
  disabled,
}: {
  /** Nullbasiert. */
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  /** Während ein Ladevorgang läuft. Ohne das erzeugen zwei schnelle Klicks zwei Abrufe, deren
   *  Antworten in beliebiger Reihenfolge eintreffen — und die Liste zeigt am Ende womöglich eine
   *  andere Seite, als der Zähler daneben behauptet. */
  disabled?: boolean;
}) {
  const tCommon = useTranslations("common");
  if (totalPages <= 1) return null;

  // Dieselbe Typo und derselbe Einzug wie `ListPagerLinks`: die beiden Fassungen unterscheiden
  // sich darin, WER die Seite hält (Zustand oder Adresse), nicht darin, wie sie aussehen. Auf
  // dem Träger-Dashboard stehen beide auf demselben Bildschirm.
  const cls = "text-neben font-medium text-foreground-muted hover:text-foreground transition "
    + "aria-disabled:text-foreground-faint aria-disabled:hover:text-foreground-faint aria-disabled:cursor-default";

  /** `aria-disabled` statt `disabled`, Schranke im Handler — Begründung bei `busyDimCls`. Hier ist
   *  es der „Weiter"-Knopf auf der vorletzten Seite: er schaltete sich unter dem eigenen Finger ab. */
  const blocked = (target: number) => Boolean(disabled) || target < 0 || target >= totalPages;
  const go = (target: number) => { if (!blocked(target)) onPage(target); };

  return (
    <div className={`flex items-center justify-between ${blockInsetCls} py-4 border-t border-border-subtle`}>
      <button type="button" onClick={() => go(page - 1)} aria-disabled={blocked(page - 1)} className={cls}>
        ← {tCommon("previous")}
      </button>
      <span className="text-neben text-foreground-faint tabular-nums">
        {page + 1} / {totalPages}
      </span>
      <button type="button" onClick={() => go(page + 1)} aria-disabled={blocked(page + 1)} className={cls}>
        {tCommon("next")} →
      </button>
    </div>
  );
}
