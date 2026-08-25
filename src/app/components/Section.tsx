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
    <section className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <BlockHeading>{title}</BlockHeading>
        {action}
      </div>
      {children}
    </section>
  );
}
