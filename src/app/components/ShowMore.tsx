"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ExpandToggle from "@/app/components/ExpandToggle";

/**
 * „Erst zwei zeigen, den Rest auf Wunsch" — Zustand und Zeile dazu, an EINER Stelle.
 *
 * Die Figur stand in `CalendarExpand` und `MonthStats` wörtlich zweimal: derselbe `showAll`-Zustand,
 * derselbe `slice`, dieselbe Restzählung, derselbe `ExpandToggle` mit denselben zwei Beschriftungen.
 * Genau daran ist sie schon einmal auseinandergelaufen — der eine Aufrufer hängte die Zeile an
 * `!showAll` und nahm damit beim Aufklappen den einzigen Weg zurück mit sich.
 *
 * Die Zeile BLEIBT deshalb stehen, sobald es überhaupt etwas zu klappen gibt. Leise und ohne
 * Bedeutungsfarbe: „zwei weitere Monate" fordert nichts.
 */
export function useShowMore<T>(items: T[], initialCount: number) {
  const [showAll, setShowAll] = useState(false);
  return {
    visible: showAll ? items : items.slice(0, initialCount),
    hidden: items.length - initialCount,
    showAll,
    toggle: () => setShowAll((v) => !v),
  };
}

/** Die Zeile dazu — `null`, solange nichts verborgen ist. */
export default function ShowMore({
  hidden,
  showAll,
  onToggle,
}: {
  hidden: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("stats");
  if (hidden <= 0) return null;
  return (
    <ExpandToggle
      label={showAll ? t("showLess") : t("showMore", { count: hidden })}
      open={showAll}
      onToggle={onToggle}
    />
  );
}
