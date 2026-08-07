"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import ExpandToggle from "@/app/components/ExpandToggle";

/** Wie viele Aufgaben offen ausliegen, bevor der Rest zusammenklappt. Eine Aufgabe mit Frist ist das
 *  Dringendste auf der Seite — aber fünf davon wären eine Wand statt eines Signals. */
const EXPANDED = 2;

/**
 * Der Stapel offener Aufgaben-Karten, gedeckelt und aufklappbar.
 *
 * Die Karten kommen als `children`, weil an ihnen unterschiedliche Aktionen hängen: beim Sub die
 * Selbstmeldung, beim Keyholder Sichtung und Rückzug. Gemeinsam ist nur der Deckel — und der ist der
 * Grund für die Komponente: die Keyholder-Übersicht baute den Stapel selbst nach und liess ihn
 * dabei weg, sodass dort jede offene und jede auf Sichtung wartende Aufgabe in voller Höhe stand.
 * Ausstehende Sichtungen altern nie aus, der Stapel wuchs also monoton.
 */
export default function TaskCardStack({ children }: { children: ReactNode }) {
  const t = useTranslations("tasks");
  const [showAll, setShowAll] = useState(false);

  const items = Children.toArray(children);
  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, EXPANDED);
  const hidden = items.length - visible.length;

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {/* Der Key der Karte selbst, nicht die Position: aufklappen ändert die Reihenfolge nicht,
            aber eine verschwundene Aufgabe würde sonst den Zustand ihrer Nachbarin erben. */}
        {visible.map((item, i) => (
          <li key={isValidElement(item) ? item.key ?? i : i}>{item}</li>
        ))}
      </ul>
      {/* Sichtbar, sobald es überhaupt etwas zu klappen gibt — nicht nur solange noch etwas verborgen
          ist. An `hidden > 0` gehängt verschwand die Zeile beim Aufklappen mitsamt dem einzigen Weg
          zurück, und `open` war dann konstant `false`: die Chevron-Drehung und `aria-expanded`, für
          die es `ExpandToggle` gibt, liefen ins Leere. */}
      {items.length > EXPANDED && (
        <div className="mt-2">
          <ExpandToggle
            label={showAll ? t("showLess") : t("showMore", { count: hidden })}
            open={showAll}
            onToggle={() => setShowAll((v) => !v)}
          />
        </div>
      )}
    </div>
  );
}
