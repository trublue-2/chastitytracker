"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import BlockHeading from "@/app/components/BlockHeading";
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

  // Geklappt wird erst, wenn mindestens ZWEI Karten dahinter verschwinden. Eine einzelne verborgene
  // spart kaum Höhe — die Klapp-Zeile nimmt den Gewinn zum Teil wieder zurück — und kostet die
  // Auffindbarkeit ganz: genau so ging die dritte Aufgabe verloren (gemeldet 20.08.2026). Preis der
  // Ausnahme: die Liste ist nicht monoton (drei Karten stehen ganz da, vier zeigen zwei). Ab vier
  // greift der Deckel unverändert, die Keyholder-Sicht mit ihren nie ausalternden Sichtungen bleibt
  // geschützt.
  const capped = items.length > EXPANDED + 1;
  const visible = showAll || !capped ? items : items.slice(0, EXPANDED);
  const hidden = items.length - visible.length;

  return (
    <div>
      {/* Der Kopf trägt die ANZAHL, weil dieser Stapel deckelt: ohne sie sieht das Eingeklappte wie
          Vollständigkeit aus — und genau so ging eine frisch zugestellte Aufgabe unter (sortiert wird
          nach Dringlichkeit, eine späte Frist landet also hinter dem Deckel). Er steht HIER und nicht
          bei den Aufrufern, weil hier der Deckel sitzt.

          „Jetzt zu tun" und nicht „Offen": der Stapel zeigt, was `belongsOnDashboard` durchlässt —
          darunter auch versäumte Aufgaben und solche, die auf die Sichtung der Keyholderin warten.
          Die Karten schreiben das selbst hin; ein Kopf, der sie „offen" nennt, widerspräche ihnen. */}
      <BlockHeading className="px-1 mb-2">{t("currentTitle", { count: items.length })}</BlockHeading>
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
      {capped && (
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
