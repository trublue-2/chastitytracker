import type { ReactNode } from "react";
import BlockHeading from "@/app/components/BlockHeading";

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
}: {
  title: ReactNode;
  /** Rechts neben der Rubrik — ein Zähler, ein Schalter, ein „alle anzeigen". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col ${className}`}>
      <div className="flex items-baseline justify-between gap-3 pb-1.5 border-b border-border">
        <BlockHeading tone="block">{title}</BlockHeading>
        {action}
      </div>
      {/* `gap-2` gehört HIERHER und nicht an die Aufrufstellen: es stand am `<section>`, und beim
          Einziehen dieses Wrappers fiel es weg — acht Abschnitte mit mehr als einem Kind klebten
          danach zusammen, unter anderem die grosse Zahl der orgasmusfreien Zeit und ihr Datum. */}
      <div className="pt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}
