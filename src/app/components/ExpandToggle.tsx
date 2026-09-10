"use client";

import { ChevronDown } from "lucide-react";

/**
 * Die „N weitere"-Zeile über einem aufklappbaren Dashboard-Abschnitt.
 *
 * Extrahiert, weil `InactiveCategories` und der Aufgaben-Block dieselbe Zeile Klasse für Klasse
 * doppelt hatten — und die zweite Fassung dabei `aria-expanded` und die Chevron-Drehung verloren
 * hatte. Zwei Zeilen, die gleich aussehen, sich für Assistenztechnik aber verschieden verhalten, sind
 * genau der Schaden, den eine Kopie anrichtet. `CalendarExpand` und `MonthStats` hatten je eine
 * eigene Fassung, beide ohne `aria-expanded` und ohne Weg zurück; sie sind inzwischen hier.
 *
 * `py-3` statt `py-1`: mit `text-sm` ergab die knappere Fassung rund 28 px Trefferhöhe — zu wenig
 * für den Daumen, und die Zeile ist in beiden Aufrufern der einzige Weg zum Verborgenen.
 */
export default function ExpandToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center justify-between text-sm text-foreground-muted hover:text-foreground transition px-1 py-3"
    >
      <span>{label}</span>
      <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );
}
