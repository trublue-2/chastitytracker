"use client";

import { useTranslations } from "next-intl";

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

  const cls = "text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition";

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
      <button type="button" onClick={() => onPage(page - 1)} disabled={disabled || page === 0} className={cls}>
        ← {tCommon("previous")}
      </button>
      <span className="text-xs text-foreground-faint tabular-nums">
        {page + 1} / {totalPages}
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages - 1} className={cls}>
        {tCommon("next")} →
      </button>
    </div>
  );
}
