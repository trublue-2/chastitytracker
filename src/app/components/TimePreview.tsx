"use client";

import { useLocale } from "next-intl";
import { formatDateTime, toDateLocale } from "@/lib/utils";

/**
 * Ein aus der Eingabe abgeleiteter Zeitpunkt im Klartext — die Zeile, die eine relative Angabe auf
 * eine Uhrzeit auflöst.
 *
 * Das Aufgaben-Formular stellt drei solche Fragen mit derselben Antwortform: wann ist Schluss (beide
 * Reiter, „Endet in 2 h" und „Endet um 18:36" sind dasselbe und sehen nicht so aus), bis wann muss
 * alles anliegen, und wann ist DIESER Nachweis fällig. Bei einer Haltefrist ist die Stundenzahl
 * gerade NICHT die Haltedauer — wer erst nach 25 Minuten anlegt, hält entsprechend kürzer; die
 * aufgelöste Uhrzeit ist die einzige Angabe, die in beiden Reitern dasselbe bedeutet.
 *
 * Geteilt vom Aufgaben-Formular und der Orgasmus-Anweisung: überall dort, wo eine Dauer über einem
 * Zeitpunkt steht, den niemand im Kopf ausrechnen soll.
 */
export default function TimePreview({ at, nowMs = 0, tz, line }: {
  /** Der anzuzeigende Zeitpunkt, gerechnet aus dem gemeinsamen „jetzt". */
  at: (nowMs: number) => Date;
  /**
   * Das „jetzt", aus dem ALLE Vorschauen dieses Formulars rechnen — vom Formular vorgegeben, nicht
   * hier gelesen. WEGLASSEN, wo die Vorschau gar nicht an der Uhr hängt (das Orgasmus-Fenster zählt
   * ab seinem eingegebenen Start): dann gibt es kein „jetzt" zu teilen und keinen Ticker zu takten.
   *
   * Vorher taktete jede Zeile für sich. Bei drei Vorschauen (Beginn, Ende, dazu je ein Nachweis)
   * waren das drei bis zwölf Intervalle für EINE Uhr — und, schlimmer, phasenverschobene: jedes
   * begann bei seinem eigenen Einbau. Übereinanderstehende Zeilen, die denselben Zeitpunkt meinen,
   * konnten so bis zu eine Minute lang „Fällig um 20:14" über „Endet um 20:15" schreiben. Genau die
   * Abweichung, die diese Vorschauen ausräumen sollen.
   */
  nowMs?: number;
  tz: string;
  /**
   * Der fertige Satz, dazu ob er ein WIDERSPRUCH ist. Bewusst beim Aufrufer: die Endzeile nennt
   * zusätzlich die Mindest-Haltezeit und kann in sich unmöglich werden, die Beginn-Zeile nicht — ein
   * zweiter Schlüssel plus optionale Parameter hätte die Fallunterscheidung bloss in dieses Bauteil
   * verschoben, das von Haltezeiten nichts wissen muss.
   *
   * Bekommt den bereits gerechneten Zeitpunkt MIT, nicht nur seine Beschriftung: wer ihn vergleichen
   * will (liegt die Nachweis-Frist nach dem Ende?), rechnete ihn sonst ein zweites Mal aus — und
   * derselbe Ausdruck zweimal ausgewertet ist bei einem Wert, der an `nowMs` hängt, nicht zwingend
   * dasselbe Ergebnis.
   */
  line: (formatted: string, nowMs: number, date: Date) => { text: string; warn?: boolean };
}) {
  const locale = useLocale();

  const date = at(nowMs);
  // Ein halb getipptes oder noch leeres Feld ist kein Fehler, sondern ein Zwischenstand — dann steht
  // hier nichts, statt „Ende: Invalid Date".
  if (Number.isNaN(date.getTime())) return null;

  const { text, warn } = line(formatDateTime(date, toDateLocale(locale), tz), nowMs, date);
  return (
    <p
      className={`text-xs font-medium tabular-nums ${warn ? "text-warn-text" : "text-foreground-muted"}`}
      suppressHydrationWarning
    >
      {text}
    </p>
  );
}
