import type { ReactNode } from "react";
import BlockHeading from "@/app/components/BlockHeading";

/**
 * Der Ton eines Abschnitts, der etwas BEDEUTET — er färbt genau zwei Dinge: die Rubrik und die
 * Haarlinie. Kein Grund, kein Rahmen, kein Radius; sonst wäre es wieder ein Kasten.
 *
 * Ausgeschrieben und nicht zusammengesetzt: ein `text-${ton}` sieht Tailwind statisch NIE. Genau
 * dieser Fehler steht in `Card.tsx` protokolliert („Dass die Karten trotzdem Farbe hatten, war
 * Zufall"). Der Record erzwingt ausserdem, dass eine neue Bedeutung hier auftaucht.
 */
const TON = {
  warn:      { rubrik: "text-warn",      linie: "border-warn-border" },
  inspect:   { rubrik: "text-inspect",   linie: "border-inspect-border" },
  request:   { rubrik: "text-request",   linie: "border-request-border" },
  sperrzeit: { rubrik: "text-sperrzeit", linie: "border-sperrzeit-border" },
  orgasm:    { rubrik: "text-orgasm",    linie: "border-orgasm-border" },
} as const;

export type SectionTone = keyof typeof TON;

/**
 * Ein Abschnitt: eine leise Rubrik, darunter der Inhalt. Kein Kasten.
 *
 * Der Bestand baute diese Figur als `<Card padding="none">` mit einer getönten Kopfzeile darin —
 * allein in `statsBlocks.tsx` achtmal, dazu in den Listen und auf der Sub-Seite. Das ergab genau
 * das Muster, das die Bildschirme hölzern macht: **Kasten in Kasten**, jeder Abschnitt gleich
 * schwer eingezäunt, und weil der Rahmen die Gliederung schon leistet, muss die Überschrift laut
 * werden, um daneben zu bestehen.
 *
 * Umgekehrt trägt hier der Abstand die Gliederung, und die Rubrik darf leise sein. Wer eine Fläche
 * WIRKLICH braucht — weil etwas sich vom Fluss der Seite abheben soll —, nimmt weiter `Card`. Das
 * ist dann eine Aussage und nicht mehr die Vorgabe.
 *
 * **Die Haarlinie unter der Rubrik gehört dazu, und sie fehlte.** Der Entwurf sagt „Haarlinien UND
 * Raum"; gebaut war nur der Raum, und der war zu knapp — gemessen 24 px zwischen zwei Blöcken
 * gegen 42 px Zeilenabstand INNERHALB eines Blocks. Bei umgekehrter Nähe kann kein Auge die Grenze
 * finden, und die Blöcke flossen ineinander.
 *
 * Sie sitzt AN der Rubrik (6 px darunter, 12 px bis zum Inhalt) und nicht frei zwischen den
 * Blöcken: eine schwebende Linie wäre formgleich mit einem Zeilentrenner. So liest sie sich als
 * Unterstreichung einer Überschrift.
 *
 * `--border` und nicht `--border-subtle`: die leise Linie ist im ganzen Baum für „innerhalb eines
 * Blocks" reserviert (alle 48 `divide-y` stehen darauf). Zwei Werte, streng getrennt — eine Linie
 * unter einem Wort ist eine Überschrift, eine Linie zwischen zwei Zeilen ist ein Trenner, und das
 * löst das Auge nur auf, solange die beiden nicht gleich hell sind.
 */

export default function Section({
  title,
  action,
  children,
  className = "",
  id,
  tone,
}: {
  title: ReactNode;
  /** Rechts neben der Rubrik — ein Zähler, ein Schalter, ein „alle anzeigen". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sprungziel, wenn irgendwo in der App ein Anker auf diesen Abschnitt zeigt. */
  id?: string;
  /** Bedeutungs-Ton für Abschnitte, die eine Aussage tragen (offene Kontrolle, laufende Sperre).
   *  Ohne ihn bleibt der Abschnitt tonlos — das ist die Vorgabe und gilt für alle Bestandsaufrufe. */
  tone?: SectionTone;
}) {
  const ton = tone ? TON[tone] : null;
  return (
    <section id={id} className={`flex flex-col ${className}`}>
      <div className={`flex items-baseline justify-between gap-3 pb-1.5 border-b ${ton ? ton.linie : "border-border"}`}>
        <BlockHeading tone="block" colorCls={ton?.rubrik}>{title}</BlockHeading>
        {action}
      </div>
      {/* `gap-2` gehört HIERHER und nicht an die Aufrufstellen: es stand am `<section>`, und beim
          Einziehen dieses Wrappers fiel es weg — acht Abschnitte mit mehr als einem Kind klebten
          danach zusammen, unter anderem die grosse Zahl der orgasmusfreien Zeit und ihr Datum. */}
      <div className="pt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}
