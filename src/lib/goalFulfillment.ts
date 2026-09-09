/**
 * Perioden-Vokabular und die GANZ-ODER-GAR-NICHT-Regel — heute noch für den TAG und den Kalender.
 *
 * Eine TrainingVorgabe speichert absolute Stundenziele je Periode (Tag/Woche/Monat/Jahr). Deckt ihr
 * Gültigkeitsfenster (gueltigAb..gueltigBis) nur einen TEIL einer Periode ab, passt das volle Ziel
 * nicht auf die Rand-Periode. Dieses Modul hält die Bausteine dafür: die Perioden-Schlüssel, die
 * Perioden-Grenzen (`periodBounds`), das wirksame Ende einer Vorgabe (`goalEffectiveEndMs`) und die
 * Regel, wann eine Periode gar nicht bewertet wird (`periodTarget`).
 *
 * **Wer WOCHE, MONAT und JAHR auswertet, ist `goalSegments.ts`** — nicht dieses Modul. Dort werden
 * sie seit dem 09.09.2026 ANTEILIG über die Segmente des Zeitraums gerechnet, weil sie regelmässig
 * einen Regelwechsel überspannen. Hier bleiben der TAG (`resolveDayGoalTarget`) und der KALENDER
 * (`statsBuilders.ts` ruft `periodTarget` je Zelle).
 *
 * **Der Vorfall, der die Regeln erzwungen hat (23.08.2026):** ein KG-Ziel 15/90/390 wurde an einem
 * Sonntag um 09:54 gesetzt. Eine Stunde später meldete `period_summary` ein Wochenziel von 7.55
 * Stunden (90 × 14.1 h Restwoche / 168 h) und stellte ihm die vollen 76.5 Ist-Stunden der ganzen
 * Woche gegenüber: 1013 % Erfüllung. Der Fehler war nicht die anteilige Rechnung, sondern dass sie
 * nur auf EINER Seite stattfand — der Nenner mass 14 Stunden, der Zähler die ganze Woche.
 *
 * Daraus zwei Regeln:
 *
 * 1. **Ziele beginnen an einer Periodengrenze.** Ohne ausdrückliches Startdatum setzt der MCP
 *    `gueltigAb` auf die nächste Mitternacht (`mcpSetTrainingGoal`), nicht auf den Aufrufzeitpunkt.
 *    Das verhindert den Fall an der Wurzel; Regel 2 greift nur noch, wenn jemand einen Start
 *    mitten in der Periode ausdrücklich WILL.
 * 2. **Liegt eine Zielgrenze in der Periode, wird sie gar nicht bewertet.** Das Ziel ist dort
 *    `null` — womit `goalPct` von selbst `null` liefert — und `changedInPeriod` sagt der
 *    MCP-Aufruferin, warum.
 *
 * **Regel 2 gilt heute nur noch für den TAG** (und für die Kalender-Zellen). Ein Tagesziel misst
 * einen Tagesbogen, keinen Nachmittag — 15 Stunden auf einen angebrochenen Tag umzurechnen ergibt
 * sachlich nichts. Für Woche, Monat und Jahr trug dasselbe Argument NICHT: dort verschwand die Zeile
 * bei jeder Ziel-Änderung, und genau das wurde am 09.09.2026 als Fehler gemeldet. Sie werden seither
 * anteilig bewertet — aber ZWEISEITIG, Zähler und Nenner aus demselben Fenster. Daran scheiterte es
 * 2026-08-23; die Herleitung steht im Kopf von `goalSegments.ts`.
 */

import { getWeekStart, getMonthStart, getMonthEnd, getYearStart, getYearEnd, midnightAfterDays, type WearHours } from "@/lib/utils";
import { tagesSollFuer } from "@/lib/weekdayGoal";

/** Validity window of a goal. `end === null` = open-ended (covers everything after `start`). */
export interface GoalWindow {
  gueltigAb: Date;
  gueltigBis: Date | null;
  /** Ist `gueltigBis` ein VOM KEYHOLDER GESETZTES Enddatum (statt eines automatisch verketteten
   *  Übergabepunkts)? Entscheidet, wie das Ende gelesen wird — siehe `goalEffectiveEndMs`. Pflicht,
   *  damit keine Datenquelle den Unterschied stillschweigend verliert; `reorderVorgabenDates` setzt
   *  ihn beim Verketten bewusst auf `false`. */
  validUntilManual: boolean;
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
 * Liegt eine Grenze des Ziels (Beginn ODER Ende) ECHT INNERHALB der Periode — teilt sie also in
 * einen Teil mit und einen Teil ohne Ziel?
 *
 * Nur dann ist die Erfüllung dieser Periode keine Aussage. Ein Ziel, das die Periode ganz abdeckt
 * (Regelfall) oder sie gar nicht berührt, teilt sie nicht. Die Grenzen selbst zählen NICHT als
 * innen: ein Ziel, das genau um Mitternacht beginnt, ist der angestrebte Normalfall aus Regel 1 —
 * es teilt den Tag nicht, es beginnt mit ihm. Das Ende wird dabei über `goalEffectiveEndMs` gelesen:
 * ein vom Keyholder gesetztes „bis 31.12." deckt den 31.12. EIN und teilt das Jahr damit nicht.
 */
/**
 * Das Ende jedes Zeitraums als Zeitstempel — die zweite Hälfte dessen, was `goalOutlook` braucht.
 *
 * Muss serverseitig entstehen: die Grenzen hängen an der Zeitzone des Trägers, und die kennt der
 * Browser nicht zwingend (ein Sub kann auf Reisen sein, während seine Vorgaben in seiner
 * Heimatzone gelten).
 */
export function periodEndsMs(now: Date, tz: string): ByPeriod<number> {
  return Object.fromEntries(
    GOAL_PERIODS.map((p) => [p, periodBounds(p, now, tz).end.getTime()]),
  ) as ByPeriod<number>;
}

/**
 * Wirksames Ende eines Ziels als Instant — die Grundlage für Abdeckung UND Grenze.
 *
 * Ein VOM KEYHOLDER GESETZTES Enddatum (`validUntilManual`) meint den Tag EINSCHLIESSLICH: „gültig
 * bis 31.12." deckt den ganzen 31.12. ab, also bis zur nächsten Mitternacht in der Zeitzone des Subs.
 * Ohne diese Lesart fiele jedes Enddatum einen ganzen Tag zu kurz aus — ein Jahresziel 1.1.–31.12.
 * galt so als „nur teilweise abgedeckt" und verschwand aus der Statistik.
 *
 * Ein AUTOMATISCH VERKETTETES Ende (`validUntilManual === false`, gesetzt von `reorderVorgabenDates`
 * auf den Start der Folge-Vorgabe) ist dagegen ein exklusiver Übergabepunkt und bleibt der rohe
 * Instant — sonst überlappte eine Vorgabe ihre Nachfolgerin um einen Tag. Offen (`null`) → `Infinity`.
 */
export function goalEffectiveEndMs(goal: GoalWindow, tz: string): number {
  const bis = goal.gueltigBis;
  if (bis == null) return Infinity;
  return goal.validUntilManual ? midnightAfterDays(bis, tz, 1).getTime() : bis.getTime();
}

export function goalBoundaryInPeriod(periodStart: Date, periodEnd: Date, goal: GoalWindow, tz: string): boolean {
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  const ab = goal.gueltigAb.getTime();
  const bis = goalEffectiveEndMs(goal, tz);
  // `bis` ist bei offenem Ziel `Infinity` → `bis < end` ist dann von selbst falsch, kein Extra-Guard.
  return (ab > start && ab < end) || (bis > start && bis < end);
}

/** Das Ziel einer Periode nach den Regeln oben. */
export interface PeriodTarget {
  /** Ziel-Stunden dieser Periode — `null`, wenn kein Ziel gesetzt ist ODER die Periode geteilt ist.
   *  Ein `null` statt eines Flags neben einer gefüllten Zahl ist Absicht: ein Flag lässt sich
   *  übergehen, wenn man nur einen Nenner sucht, ein `null` nicht (`goalPct(x, null)` und
   *  `goalMet(x, null)` sind bereits `null`). Genau daran wäre der Kalender bei seiner
   *  Prozentrechnung geblieben, während drei andere Anzeigen sie schon nicht mehr machten. */
  targetH: number | null;
  /** Eine Zielgrenze liegt in dieser Periode (Regel 2). Ohne gesetztes Ziel immer `false` — wo
   *  nichts bewertet wird, gibt es auch nichts zu unterdrücken. */
  changedInPeriod: boolean;
}

const NO_TARGET: PeriodTarget = { targetH: null, changedInPeriod: false };

/**
 * Das Ziel einer Periode nach den Regeln oben.
 *
 * `baseTargetH == null` (Periode ohne Ziel) → `NO_TARGET`. Deckt die Vorgabe die Periode nicht ab
 * → Ziel 0, wie bisher: `goalPct` liest eine 0 bewusst als „deckt diese Periode nicht ab" und nicht
 * als „zu 100 % erfüllt".
 */
export function periodTarget(
  baseTargetH: number | null | undefined,
  periodStart: Date,
  periodEnd: Date,
  goal: GoalWindow,
  tz: string,
): PeriodTarget {
  if (baseTargetH == null) return NO_TARGET;
  if (goalBoundaryInPeriod(periodStart, periodEnd, goal, tz)) return { targetH: null, changedInPeriod: true };
  return { targetH: goalCoversPeriod(periodStart, periodEnd, goal, tz) ? baseTargetH : 0, changedInPeriod: false };
}

/**
 * Deckt die Vorgabe die GANZE Periode ab?
 *
 * Nur zusammen mit `goalBoundaryInPeriod` sinnvoll zu lesen: liegt keine Grenze in der Periode,
 * sind ganz und gar nicht die einzigen beiden Lagen — ein Zwischenwert kann dann nicht entstehen.
 * Genau das macht ein anteilig gekürztes Ziel überflüssig, und deshalb steht die Aussage hier als
 * Code und nicht als Kommentar.
 *
 * Die Längenprüfung am Ende hält eine entartete Periode (`end <= start`) bei „deckt nicht ab" —
 * `periodBounds` erzeugt keine solche, aber ohne die Prüfung wäre sie durch die beiden
 * Vergleiche darüber trivial „abgedeckt".
 */
function goalCoversPeriod(periodStart: Date, periodEnd: Date, goal: GoalWindow, tz: string): boolean {
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  return goal.gueltigAb.getTime() <= start && goalEffectiveEndMs(goal, tz) >= end && end > start;
}

/** The four period hour-targets of a training goal. */
export interface VorgabePeriodTargets {
  minProTagH: number | null;
  minProWocheH: number | null;
  minProMonatH: number | null;
  minProJahrH: number | null;
  /** Wochentag-Ausnahmen des Tages-Solls (JSON-Spalte, roh). Optional, damit Bestands-Fixtures und
   *  ältere Aufrufer ohne das Feld weiterlaufen — fehlt es, gilt überall `minProTagH` (heutiges
   *  Verhalten). Aufgelöst in {@link resolveDayGoalTarget} über `resolveDayTarget`. */
  minProTagWochentage?: string | null;
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
  /** Ziel je Periode — `null`, wo nichts gesetzt oder die Periode geteilt ist. */
  targetH: ByPeriod<number | null>;
  changedInPeriod: GoalChangedInPeriod;
}

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
export function hasVisibleGoalRow(targetH: Partial<ByPeriod<number | null>>): boolean {
  return GOAL_PERIODS.some((period) => !!targetH[period]);
}

/**
 * Das TAGES-Ziel einer Vorgabe, aufgelöst gegen den heutigen Tag.
 *
 * Nur noch der Tag: Woche, Monat und Jahr überspannen regelmässig einen Regelwechsel (neues Ziel
 * ohne Enddatum → Verkettung) und werden deshalb in `goalSegments.ts` über die SEGMENTE gerechnet.
 * Diese Funktion gibt für sie bewusst gar keinen Wert mehr zurück — nicht einmal einen ungenutzten.
 * Ein Wert nach alter Regel wäre eine Falle gewesen: Wer die naheliegend benannte Funktion nimmt,
 * bekäme eine Zahl, die keine Anzeige mehr verwendet.
 *
 * Der Tag bleibt hier, weil ein Tagesziel einen Tagesbogen misst und keinen Nachmittag — er wird
 * ganz oder gar nicht bewertet (Regel 2 oben).
 */
export function resolveDayGoalTarget(
  goal: (GoalWindow & VorgabePeriodTargets) | null,
  now: Date,
  tz: string,
): PeriodTarget {
  if (!goal) return NO_TARGET;
  // Das Tages-Soll folgt dem Wochentag von HEUTE: eine passende Ausnahme ersetzt `minProTagH` (0 =
  // Ruhetag).
  const dayBase = tagesSollFuer(goal, now, tz);
  if (dayBase == null) return NO_TARGET;
  const { start, end } = periodBounds("day", now, tz);
  return periodTarget(dayBase, start, end, goal, tz);
}

