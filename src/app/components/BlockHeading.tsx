import type { ReactNode } from "react";

/**
 * Die Beschriftung eines Dashboard-Blocks: kleine, leise Versalien über der Liste darunter.
 *
 * Extrahiert, weil dieselbe Klassenzeile im Baum über zwanzigmal von Hand stand — und dabei
 * auseinanderlief: mal `<p>`, mal `<h2>`, mal mit `px-1`, mal ohne. Als Überschrift ist sie richtig
 * (ein Block ist ein Abschnitt mit Namen), aber genau EINEN Block umzustellen macht die Gliederung
 * schlechter als gar keine: die Überschriften-Navigation spränge dann auf den einen und suggerierte,
 * die übrigen seien keine Abschnitte. Deshalb die gemeinsame Komponente statt einer weiteren Kopie.
 *
 * `children` statt eines `title`-Strings: manche Köpfe tragen ein Icon vor dem Text.
 */
export default function BlockHeading({ as: Tag = "h2", children, className = "" }: {
  /** Die Ebene. `h2` ist die Vorgabe (ein Block IST ein Abschnitt); `h3` für eine Gruppe INNERHALB
   *  eines Blocks (Tagesköpfe), `span` für Tabellen-Spaltenköpfe, die keine Abschnitte benennen und
   *  in der Überschriften-Navigation nichts verloren haben.
   *
   *  Ergänzt, weil die Klassenkette sonst genau dort von Hand kopiert wurde, wo eine andere Ebene
   *  gebraucht war — siebenmal, in derselben Sitzung, in der dieses Bauteil die eine Quelle sein
   *  sollte. Ein Bauteil, das nur EINE Ebene kann, erzeugt Kopien statt sie zu verhindern. */
  as?: "h2" | "h3" | "span";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag className={`text-rubrik font-semibold uppercase tracking-wider text-foreground-faint ${className}`}>
      {children}
    </Tag>
  );
}
