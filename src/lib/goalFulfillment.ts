/**
 * Trainingsziel-Erfüllung je Periode: Ziel-Nenner UND die Frage, ob er überhaupt eine Aussage trägt.
 *
 * Eine TrainingVorgabe speichert absolute Stundenziele je Periode (Tag/Woche/Monat/Jahr). Deckt ihr
 * Gültigkeitsfenster (gueltigAb..gueltigBis) nur einen TEIL einer Periode ab — ein Wochenziel, das
 * am Freitag gesetzt wird — so passt das volle Ziel nicht auf die Rand-Periode. Dieses Modul
 * zentralisiert die Regeln dafür, damit jede Erfüllungs-Anzeige (Stats, Kalender, Live-Ziele, MCP)
 * denselben Nenner rechnet.
 *
 * **Der Vorfall, der die Regeln erzwungen hat (23.08.2026):** ein KG-Ziel 15/90/390 wurde an einem
 * Sonntag um 09:54 gesetzt. Eine Stunde später meldete `period_summary` ein Wochenziel von 7.55
 * Stunden (90 × 14.1 h Restwoche / 168 h) und stellte ihm die vollen 76.5 Ist-Stunden der ganzen
 * Woche gegenüber: 1013 % Erfüllung. Der Fehler war nicht die anteilige Rechnung, sondern dass sie
 * nur auf EINER Seite stattfand — der Nenner mass 14 Stunden, der Zähler die ganze Woche.
 *
 * Daraus die drei Regeln:
 *
 * 1. **Ziele beginnen an einer Periodengrenze.** Ohne ausdrückliches Startdatum setzt der MCP
 *    `gueltigAb` auf die nächste Mitternacht (`mcpSetTrainingGoal`), nicht auf den Aufrufzeitpunkt.
 *    Das verhindert den Fall an der Wurzel; alles Weitere hier greift nur noch, wenn jemand einen
 *    Start mitten in der Periode ausdrücklich WILL.
 * 2. **Liegt eine Zielgrenze in der Periode, gibt es keinen Prozentwert.** Statt ihn zu reparieren,
 *    wird er unterdrückt: das Ziel zum RECHNEN (`targetH`) ist dort `null`, womit `goalPct` von
 *    selbst `null` liefert. Das anteilige Ziel bleibt als Anzeige-Absolutwert (`displayH`) neben
 *    den Ist-Stunden stehen, und `changedInPeriod` sagt der MCP-Aufruferin, warum.
 * 3. **Tagesziele werden nie anteilig gerechnet.** Ein Tagesziel misst einen Tagesbogen, keinen
 *    Nachmittag: 15 Stunden auf einen angebrochenen Tag umzurechnen ergibt sachlich nichts. Der
 *    Anbruchtag wird darum gar nicht bewertet (`targetH: null`), ab dem Folgetag gilt der volle Wert.
 */

import { getWeekStart, getMonthStart, getMonthEnd, getYearStart, getYearEnd, midnightAfterDays } from "@/lib/utils";

/** Validity window of a goal. `end === null` = open-ended (covers everything after `start`). */
export interface GoalWindow {
  gueltigAb: Date;
  gueltigBis: Date | null;
}

/** Die vier Perioden in Anzeige-Reihenfolge. Die Werte sind zugleich die i18n-Schlüssel im
 *  `dashboard`-Namensraum (`day`/`week`/`month`/`year`) — eine Liste statt vier abgeschriebener
 *  Zeilen je Anzeige. */
export const GOAL_PERIODS = ["day", "week", "month", "year"] as const;

export type GoalPeriod = (typeof GOAL_PERIODS)[number];

/** Die vier Perioden-Werte einer Auswertung, unter den Perioden-Schlüsseln. */
export type ByPeriod<T> = Record<GoalPeriod, T>;

/** Half-open bounds `[start, end)` of the current day/week/month/year in `tz`.
 *  `tz` ist Pflicht wie in der Wanduhr-Familie, auf der das hier aufsetzt — Begründung bei `tzDateParts`. */
export function periodBounds(period: GoalPeriod, now: Date, tz: string): { start: Date; end: Date } {
  switch (period) {
    case "day":
      // Beide Grenzen aus derselben Kalendertag-Auflösung — `getMidnightToday` würde `tzDateParts`
      // ein zweites Mal für denselben Instant nachschlagen.
      return { start: midnightAfterDays(now, tz, 0), end: midnightAfterDays(now, tz, 1) };
    case "week": {
      const start = getWeekStart(now, tz);
      return { start, end: midnightAfterDays(start, tz, 7) };
    }
    case "month":
      return { start: getMonthStart(now, tz), end: getMonthEnd(now, tz) };
    case "year":
      return { start: getYearStart(now, tz), end: getYearEnd(now, tz) };
  }
}

/**
 * Fraction (0..1) of the half-open period `[periodStart, periodEnd)` that the goal window
 * `[gueltigAb, gueltigBis ?? +∞)` covers. Returns 0 for no overlap, 1 for full coverage.
 */
export function periodOverlapRatio(
  periodStart: Date,
  periodEnd: Date,
  gueltigAb: Date,
  gueltigBis: Date | null,
): number {
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (periodMs <= 0) return 0;
  const from = Math.max(periodStart.getTime(), gueltigAb.getTime());
  const to = Math.min(periodEnd.getTime(), gueltigBis ? gueltigBis.getTime() : periodEnd.getTime());
  const overlap = to - from;
  if (overlap <= 0) return 0;
  return Math.min(1, overlap / periodMs);
}

/**
 * Liegt eine Grenze des Ziels (Beginn ODER Ende) ECHT INNERHALB der Periode — teilt sie also in
 * einen Teil mit und einen Teil ohne Ziel?
 *
 * Nur dann ist die Erfüllung dieser Periode keine Aussage. Ein Ziel, das die Periode ganz abdeckt
 * (Regelfall) oder sie gar nicht berührt, teilt sie nicht. Die Grenzen selbst zählen NICHT als
 * innen: ein Ziel, das genau um Mitternacht beginnt, ist der angestrebte Normalfall aus Regel 1 —
 * es teilt den Tag nicht, es beginnt mit ihm.
 */
export function goalBoundaryInPeriod(periodStart: Date, periodEnd: Date, goal: GoalWindow): boolean {
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  const ab = goal.gueltigAb.getTime();
  const bis = goal.gueltigBis?.getTime();
  return (ab > start && ab < end) || (bis != null && bis > start && bis < end);
}

/**
 * Das Ziel einer Periode in ZWEI Lesarten — und welche davon den kurzen Namen trägt, ist Absicht.
 *
 * Ein paralleles „hier nicht rechnen"-Flag neben einer weiterhin gefüllten Zahl lässt sich
 * versehentlich übergehen: wer nur einen Nenner braucht, nimmt die Zahl und liest das Flag nicht —
 * ohne dass es auffällt. Genau so wäre der Kalender bei seiner Prozentrechnung geblieben, während
 * drei andere Anzeigen sie schon nicht mehr machten. Ein `null` kann man nicht übergehen:
 * `goalPct(x, null)` und `goalMet(x, null)` sind bereits `null`. Deshalb heisst die sichere Lesart
 * `targetH` und die gefährliche `displayH`.
 */
export interface PeriodTarget {
  /** Ziel-Stunden für die BEWERTUNG. `null`, wenn kein Ziel gesetzt ist ODER die Periode geteilt
   *  ist. Wer einen Prozentwert, einen Balken oder ein „erreicht" bildet, nimmt DIESEN Wert. */
  targetH: number | null;
  /** Dasselbe Ziel als ANZEIGE-Absolutwert: in einer geteilten Periode das anteilige Ziel, das
   *  `targetH` dort verschweigt. `period_summary.goalWeekH` liefert es neben den Ist-Stunden, damit
   *  die Aufruferin die Lage selbst beurteilen kann. Beim TAG immer gleich `targetH` — Regel 3
   *  kürzt ein Tagesziel gar nicht erst, es gibt also keinen Anteil zu zeigen.
   *  **Nie als Nenner verwenden.** */
  displayH: number | null;
  /** Eine Zielgrenze liegt in dieser Periode (Regel 2). Ohne gesetztes Ziel immer `false` — wo
   *  nichts bewertet wird, gibt es auch nichts zu unterdrücken. */
  changedInPeriod: boolean;
}

const NO_TARGET: PeriodTarget = { targetH: null, displayH: null, changedInPeriod: false };

/**
 * Das Ziel einer Periode nach den drei Regeln oben.
 *
 * `baseTargetH == null` (Periode ohne Ziel) → `NO_TARGET`. Überlappung 0 (Ziel deckt die Periode
 * nicht ab) → Ziel 0, wie bisher: `goalPct` liest eine 0 bewusst als „deckt diese Periode nicht ab"
 * und nicht als „zu 100 % erfüllt".
 *
 * `period` unterscheidet ausschliesslich die ANZEIGE: Woche, Monat und Jahr zeigen in einer
 * geteilten Periode ihr anteiliges Ziel, der Tag nach Regel 3 nichts.
 */
export function periodTarget(
  baseTargetH: number | null | undefined,
  period: GoalPeriod,
  periodStart: Date,
  periodEnd: Date,
  goal: GoalWindow,
): PeriodTarget {
  if (baseTargetH == null) return NO_TARGET;
  const prorated = baseTargetH * periodOverlapRatio(periodStart, periodEnd, goal.gueltigAb, goal.gueltigBis);
  if (!goalBoundaryInPeriod(periodStart, periodEnd, goal)) {
    return { targetH: prorated, displayH: prorated, changedInPeriod: false };
  }
  return { targetH: null, displayH: period === "day" ? null : prorated, changedInPeriod: true };
}

/** The four period hour-targets of a training goal. */
export interface VorgabePeriodTargets {
  minProTagH: number | null;
  minProWocheH: number | null;
  minProMonatH: number | null;
  minProJahrH: number | null;
}

/** Je Periode: liegt eine Zielgrenze darin (Regel 2)? Nur der MCP meldet das noch ausdrücklich
 *  (`period_summary.goalChangedInPeriod`); die Anzeigen brauchen es nicht mehr, weil ein geteiltes
 *  Ziel ihnen bereits als `targetH: null` begegnet. */
export type GoalChangedInPeriod = ByPeriod<boolean>;

/**
 * Die vier Perioden-Ziele einer Vorgabe, aufgelöst gegen den AKTUELLEN Tag/Woche/Monat/Jahr.
 *
 * Ein Fan-out, den sich jede „aktives Ziel jetzt"-Anzeige teilt (Dashboard, Admin, Stats-Karten,
 * Kategorie-Ziele, MCP), damit die Regeln nicht je Anzeige neu ausgelegt werden.
 *
 * Die Werte stehen unter den Perioden-Schlüsseln und nicht mehr unter den deutschen Bestandsnamen
 * (`minProTagH` …): sonst schreibt jede Anzeige die Zuordnung „Tag → day" erneut ab, und für die
 * Kategorie-Zeilen mit ihrer eigenen Schreibweise (`goalDayH` …) käme eine dritte dazu.
 */
export interface VorgabeTargets {
  /** Ziel je Periode für die BEWERTUNG — `null`, wo nichts gesetzt oder die Periode geteilt ist. */
  targetH: ByPeriod<number | null>;
  /** Ziel je Periode als ANZEIGE-Absolutwert. Nie als Nenner (siehe `PeriodTarget.displayH`). */
  displayH: ByPeriod<number | null>;
  changedInPeriod: GoalChangedInPeriod;
}

const NO_TARGETS: VorgabeTargets = {
  targetH: { day: null, week: null, month: null, year: null },
  displayH: { day: null, week: null, month: null, year: null },
  changedInPeriod: { day: false, week: false, month: false, year: false },
};

/**
 * Bleibt überhaupt eine bewertbare Ziel-Zeile übrig?
 *
 * Der Unterschied zu „hat die Vorgabe ein Ziel?" ist der Grund für diese Funktion: eine Vorgabe
 * kann Ziele tragen und trotzdem in JEDER Periode ungewertet sein — etwa am Tag, an dem sie
 * beginnt. Wer weiterhin nur „Ziel gesetzt?" prüft, rendert eine Überschrift über einer leeren Liste.
 *
 * Die Truthy-Prüfung ist dieselbe wie in `goalPct`: ein Ziel von 0 heisst „deckt diese Periode
 * nicht ab" und bekommt keine Zeile. Mit `!= null` behauptete diese Funktion Sichtbarkeit für eine
 * Zeile, die sich anschliessend selbst wegrendert.
 */
export function hasVisibleGoalRow(targetH: ByPeriod<number | null>): boolean {
  return GOAL_PERIODS.some((period) => !!targetH[period]);
}

export function proratedVorgabeTargets(
  goal: (GoalWindow & VorgabePeriodTargets) | null,
  now: Date,
  tz: string,
): VorgabeTargets {
  if (!goal) return NO_TARGETS;
  const base: ByPeriod<number | null> = {
    day: goal.minProTagH, week: goal.minProWocheH, month: goal.minProMonatH, year: goal.minProJahrH,
  };
  const targetH = {} as ByPeriod<number | null>;
  const displayH = {} as ByPeriod<number | null>;
  const changedInPeriod = {} as GoalChangedInPeriod;
  for (const period of GOAL_PERIODS) {
    // Perioden ohne Ziel überspringen die Grenzberechnung: `periodBounds` kostet mehrere
    // Intl-Auflösungen, und eine typische Vorgabe setzt ein oder zwei der vier Perioden.
    if (base[period] == null) {
      targetH[period] = null;
      displayH[period] = null;
      changedInPeriod[period] = false;
      continue;
    }
    const { start, end } = periodBounds(period, now, tz);
    const t = periodTarget(base[period], period, start, end, goal);
    targetH[period] = t.targetH;
    displayH[period] = t.displayH;
    changedInPeriod[period] = t.changedInPeriod;
  }
  return { targetH, displayH, changedInPeriod };
}
