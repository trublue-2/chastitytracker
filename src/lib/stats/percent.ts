/**
 * Die drei Prozent-Bedeutungen des Trackers — getrennt benannt, weil sie verschiedene Nenner haben
 * und trotzdem alle als „%" auf dem Schirm landen.
 *
 * **Der Vorfall, der das Modul erzwungen hat (Etappe A, 22.08.2026):** auf dem Sub-Dashboard stand
 * dieselbe Tragezeit zweimal — in der grünen Session-Karte als `17h 26min / 20h` mit **87 %**
 * (Anteil am Tagesziel), wenige Zeilen darunter in der Kachel „Heute" als `17h 26min` mit
 * **81 %** (Anteil der bisher verstrichenen Tagesstunden). Beide Zahlen waren richtig; keine von
 * beiden sagte, wovon sie ein Anteil ist. Sechs Stellen im Baum rechneten
 * `Math.round(a / b * 100)` je für sich, und dem Code sah man den Unterschied nicht an.
 *
 * Die Regel, die daraus folgt: **eine Prozentzahl ohne ihren Nenner ist unfertig.** Wo die
 * Umgebung ihn nicht ohnehin nennt (etwa durch ein danebenstehendes `ist / soll`), gehört er in
 * die Beschriftung — Vorbild ist `stats.percentLocked`: „81 % des Jahres verschlossen".
 */

/** Auf ganze Prozent runden. Nur hier, damit alle drei gleich runden. */
const asPct = (ratio: number): number => Math.round(ratio * 100);

/**
 * **Zielerfüllung** — Anteil am SOLL. „Wie viel von dem, was verlangt ist, habe ich?"
 *
 * `null` bei fehlendem oder null-wertigem Ziel: ein Ziel von 0 heisst „die Vorgabe deckt
 * diese Periode nicht ab", nicht „zu 100 % erfüllt". Deshalb Truthy-Prüfung statt `!= null`.
 *
 * **Nicht geklemmt.** Wer sein Ziel übertrifft, hat 130 % — und soll das sehen. Ein Balken, der
 * nicht über 100 hinauskann, klemmt seine eigene Breite (`Math.min(100, pct)`), nicht die Zahl.
 */
export function goalPct(actual: number, target: number | null | undefined): number | null {
  return target && target > 0 ? asPct(actual / target) : null;
}

/**
 * **Zeitanteil** — Anteil an einer VERSTRICHENEN oder abgesteckten Zeitspanne. „Welchen Teil des
 * Tages war ich verschlossen?"
 *
 * Auf 100 geklemmt: mehr als die verstrichene Zeit kann man nicht getragen haben, und ein
 * Rundungs- oder Zeitzonen-Rest darf keine 101 % erzeugen.
 */
export function coveragePct(part: number, elapsed: number): number | null {
  return elapsed > 0 ? Math.min(100, asPct(part / elapsed)) : null;
}

/**
 * **Verteilungsanteil** — Anteil an einer SUMME. „Wie viel der Gesamtzeit entfällt auf dieses
 * Gerät?" Die Anteile einer Aufteilung ergeben zusammen 100.
 */
export function sharePct(part: number, total: number): number {
  return total > 0 ? asPct(part / total) : 0;
}

/**
 * **Verhältnis → Prozent**, ohne eigene Division. Für Werte, die schon als Anteil (0…1) vorliegen —
 * etwa die Schwellen der Tragestufen in der Jahresübersicht.
 *
 * Steht hier und nicht am Aufrufort, damit die Rundung an EINER Stelle bleibt: sonst wäre das
 * Register wieder unvollständig, sobald jemand ein `Math.round(x * 100)` danebenschreibt.
 */
export function ratioPct(ratio: number): number {
  return asPct(ratio);
}
