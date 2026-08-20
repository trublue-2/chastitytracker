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
export default function BlockHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-xs font-semibold uppercase tracking-wider text-foreground-faint ${className}`}>
      {children}
    </h2>
  );
}
