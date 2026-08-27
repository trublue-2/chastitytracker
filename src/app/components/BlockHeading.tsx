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
 *
 * **Zwei Lautstärken, und der Unterschied ist nicht Geschmack.** `block` benennt einen ganzen
 * Abschnitt des Bildschirms, `label` eine Spalte oder eine Gruppe INNERHALB eines Blocks. Beide
 * sahen gleich aus, und dadurch war die Rubrik eines Blocks leiser als der Fliesstext darunter —
 * genau die Rückmeldung „Titel sind teilweise kleiner als der Inhalt". Den Ausschlag gibt dabei
 * weniger die Grösse (11 → 12 px) als die Farbe: `faint` liegt bei 5,4:1 zum Grund, `muted` bei
 * rund 10:1.
 *
 * NICHT auf `text-fliess` (14) oder `text-zeile` (16) angehoben: dort stünde die Rubrik gleich laut
 * neben der Primärzeile der Liste, und der Block hätte zwei gleich wichtige Dinge.
 *
 * **Grösse und Farbe stehen getrennt**, weil ein Aufrufer die FARBE ersetzen können muss, ohne die
 * Lautstärke mitzunehmen: ein Abschnitt mit Bedeutung (`Section tone="warn"`) trägt dieselbe
 * Rubrik-Grösse, aber nicht `foreground-muted`. Beides in einer Zeichenkette zwang die Aufrufstelle,
 * ein zweites `text-*` HINTEN anzuhängen — und dann entscheidet die Reihenfolge im erzeugten
 * Stylesheet, nicht die im String. Genau der Würfel, den `Badge` schon protokolliert hat.
 */
const TONE = {
  /** Die Rubrik eines ganzen Blocks. */
  block: { size: "text-neben", color: "text-foreground-muted" },
  /** Ein Spalten- oder Gruppenkopf innerhalb eines Blocks — bleibt leiser als sein Block. */
  label: { size: "text-rubrik", color: "text-foreground-faint" },
} as const;

export default function BlockHeading({ as: Tag = "h2", tone = "label", colorCls, children, className = "" }: {
  /** Die Ebene. `h2` ist die Vorgabe (ein Block IST ein Abschnitt); `h3` für eine Gruppe INNERHALB
   *  eines Blocks (Tagesköpfe), `span` für Tabellen-Spaltenköpfe, die keine Abschnitte benennen und
   *  in der Überschriften-Navigation nichts verloren haben.
   *
   *  Ergänzt, weil die Klassenkette sonst genau dort von Hand kopiert wurde, wo eine andere Ebene
   *  gebraucht war — siebenmal, in derselben Sitzung, in der dieses Bauteil die eine Quelle sein
   *  sollte. Ein Bauteil, das nur EINE Ebene kann, erzeugt Kopien statt sie zu verhindern. */
  as?: "h2" | "h3" | "span";
  /** Vorgabe `label`: die grosse Fassung setzt `Section`, und alles andere ist innerhalb eines Blocks. */
  tone?: keyof typeof TONE;
  /** ERSETZT die Farbe des Tons (nicht ergänzen — siehe Docblock von `TONE`). Für Rubriken, die
   *  eine Bedeutung tragen. */
  colorCls?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag className={`font-semibold uppercase tracking-wider ${TONE[tone].size} ${colorCls ?? TONE[tone].color} ${className}`}>
      {children}
    </Tag>
  );
}
