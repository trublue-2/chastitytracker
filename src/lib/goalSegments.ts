/**
 * Ziel UND Ist der Perioden, die über SEGMENTE gerechnet werden — Woche, Monat, Jahr.
 *
 * Warum diese drei ein eigenes Modul bekommen, während der Tag in `goalFulfillment.ts` bleibt: sie
 * überspannen regelmässig einen REGELWECHSEL. Wer sein Ziel ändert, legt dafür eine neue Vorgabe
 * ohne Enddatum an; `reorderVorgabenDates` verkettet die alte darauf. Für den Tag ist „jetzt"
 * danach eindeutig (das aktive Ziel), für Woche/Monat/Jahr nicht — sie enthalten beide Phasen.
 *
 * **Der Grundsatz (Entscheidung des Keyholders, 09.09.2026):** *Jeder Tag wird nach der Regel
 * bewertet, die an diesem Tag galt.* Wer im Juni von „30 %" auf „50 %" hochschraubt, bekommt fürs
 * Jahr die Summe beider Phasen; wer am 7.9. ein Monatsziel setzt, bekommt für den September dessen
 * anteiligen Wert. Die Alternative wäre gewesen, das neue Ziel rückwirkend auf die ganze Periode zu
 * legen („aufholen") — das unterstellt der Keyholderin, sie wolle die Vergangenheit umdeuten. Die
 * Mischrechnung unterstellt nichts. Und wer die Aufhol-Variante WILL, drückt sie aus, indem sie das
 * Ziel auf den Periodenbeginn datiert statt eine Kette anzulegen — die Absicht steckt im
 * Startdatum, nicht im Ratespiel.
 *
 * **Der TAG bleibt bewusst aussen vor.** Ein Tagesziel misst einen Tagesbogen, kein angebrochenes
 * Stück Nachmittag — 15 Stunden auf einen halben Tag umzurechnen ergibt sachlich nichts
 * (Begründung im Kopf von `goalFulfillment.ts`). Er wird weiterhin ganz oder gar nicht bewertet.
 *
 * **Zwei Regeln, die zusammengehören:**
 *
 * 1. **Sichtbarkeit hängt am AKTIVEN Ziel.** Trägt das gerade aktive Ziel für diese Periode kein
 *    Soll, gibt es keine Zeile — auch dann nicht, wenn ein früheres Segment eines hatte. Ebenso:
 *    läuft gerade gar kein Ziel, zeigt der Block nichts (das entscheiden die Aufrufer).
 * 2. **Der WERT aggregiert über die Segmente** der laufenden Periode. Ein Segment ohne eigenes Soll
 *    für diese Periode steuert WEDER Tage NOCH Stunden bei — „jedes Ziel für sich": es verwässert
 *    die Quote nicht, weil in seinen Tagen nichts verlangt war.
 *
 * **Zähler und Nenner entstehen hier gemeinsam, und das ist der ganze Punkt.** Am 23.08.2026
 * meldete `period_summary` 1013 % Erfüllung, weil ein anteilig gekürztes Ziel (Nenner: Restwoche)
 * den Ist-Wert der GANZEN Woche gegenüberstand. Der Fehler war nicht das Anteilige, sondern dass es
 * nur auf einer Seite stattfand. Damals wurde deshalb JEDE anteilige Kürzung gestrichen; seit dem
 * 09.09.2026 gibt es sie wieder — aber nur so, dass beide Seiten aus demselben Fenster kommen. Wer
 * nur `targetH` nimmt und den Ist-Wert weiter selbst über `periodStart..now` rechnet, baut den
 * alten Fehler neu.
 */

import {
  calendarDaysBetween, wearingHoursFromPairs, type WearHours, type WearPair,
} from "@/lib/utils";
import {
  periodBounds, goalEffectiveEndMs, resolveDayGoalTarget, hasVisibleGoalRow,
  type GoalWindow, type GoalPeriod, type VorgabePeriodTargets, type VorgabeTargets,
  type ByPeriod, type GoalChangedInPeriod,
} from "@/lib/goalFulfillment";

/** Die Perioden, die über die Segmente gerechnet werden — alle ausser dem Tag (Begründung im Kopf).
 *  Als `Exclude` abgeleitet und nicht danebengeschrieben: käme je eine fünfte Periode dazu, fiele
 *  sie hier auf, statt nur zufällig gleich zu heissen. */
export type SegmentedPeriod = Exclude<GoalPeriod, "day">;

export const SEGMENTED_PERIODS = ["week", "month", "year"] as const satisfies readonly SegmentedPeriod[];

/** Ein Segment: Gültigkeitsfenster (samt `validUntilManual` für die einschliessende Lesart des
 *  Endes) plus die Perioden-Solls, die es selbst trägt. `minProTagH` fehlt — der Tag aggregiert
 *  nicht. */
export interface GoalSegment extends GoalWindow {
  minProWocheH: number | null;
  minProMonatH: number | null;
  minProJahrH: number | null;
}

/** Welches Feld einer Vorgabe das Soll DIESER Periode trägt. Die eine Zuordnung, statt sie in jeder
 *  Verzweigung erneut abzuschreiben. Ein Feld-NAME statt einer Lesefunktion: so prüft der Compiler
 *  am Zugriff, dass das übergebene Objekt das Feld wirklich hat — eine Funktion mit weitem
 *  Parametertyp hätte für ein falsch geformtes Objekt still `null` („kein Ziel") geliefert. */
const SOLL_OF: Record<SegmentedPeriod, "minProWocheH" | "minProMonatH" | "minProJahrH"> = {
  week: "minProWocheH", month: "minProMonatH", year: "minProJahrH",
};

/** Segmente absteigend nach Beginn — die Reihenfolge, in der die Wasserlinie unten arbeitet. Sie
 *  hängt NICHT von der Periode ab, wird also einmal gebildet und über alle drei geteilt. */
const byStartDesc = (segments: GoalSegment[]): GoalSegment[] =>
  [...segments].sort((a, b) => b.gueltigAb.getTime() - a.gueltigAb.getTime());

/** Ziel und Ist einer segmentierten Periode. `targetH: null` = keine bewertbare Zeile (dann ist
 *  `actualH` 0 und bedeutungslos) — dieselbe Konvention wie `PeriodTarget.targetH`. */
export interface SegmentedGoalProgress {
  targetH: number | null;
  actualH: number;
}

/** Keine bewertbare Zeile — auch als Rückfall für Aufrufer, die ein Fenster gar nicht bilden. */
export const NO_SEGMENTED_GOAL: SegmentedGoalProgress = { targetH: null, actualH: 0 };

/**
 * Ziel und Ist EINER segmentierten Periode für den Zeitraum, in dem `now` liegt.
 *
 * `active` entscheidet nur über die SICHTBARKEIT (Regel 1), `segments` über den WERT (Regel 2).
 * `segments` darf ruhig alle Vorgaben der Kategorie enthalten — auch alte Zeiträume und solche ohne
 * Soll für diese Periode; beide fallen hier heraus. Das erspart jedem Aufrufer eine eigene
 * Vorauswahl, die sonst an fünf Stellen leicht verschieden ausfiele.
 *
 * `wearPairs` sind die Trage-Paare DIESER Kategorie (Wanduhr-Zeit, also bereits verschmolzen), und
 * sie müssen bis zum Periodenbeginn zurückreichen — sonst fehlt dem Ist-Wert der Anfang.
 *
 * **Der Einzel-Perioden-Einstieg** — die aktiv-gegatete Fassung von `segmentedGoalWindows`, für
 * genau eine Periode und „jetzt". Die Anzeigen nehmen `resolveGoalRow` (alle drei auf einmal),
 * Kalender und Monatsübersicht die Fabrik mit eigenen Fenstern.
 */
export function resolveSegmentedGoal(
  period: SegmentedPeriod,
  active: VorgabePeriodTargets | null,
  segments: GoalSegment[],
  wearPairs: WearPair[],
  now: Date,
  tz: string,
): SegmentedGoalProgress {
  // Regel 1: ohne Soll auf dem aktiven Ziel gibt es die Zeile nicht — unabhängig davon, was frühere
  // Segmente verlangt haben.
  if (active == null || active[SOLL_OF[period]] == null) return NO_SEGMENTED_GOAL;
  const { start, end } = periodBounds(period, now, tz);
  return segmentedGoalWindows(segments, wearPairs, now, tz)(period, start, end);
}

/**
 * Der Rechenkern über einem AUSDRÜCKLICH übergebenen Fenster — ohne „jetzt" als Periodenquelle.
 *
 * Getrennt von `resolveSegmentedGoal`, weil `resolveGoalRow` drei Perioden nacheinander auswertet:
 * die Sortierung hängt nicht von der Periode ab und die Grenzen kennt der Aufrufer dort ohnehin
 * schon. `segments` muss bereits absteigend nach Beginn sortiert sein (`byStartDesc`).
 */
function segmentedGoalOver(
  soll: (typeof SOLL_OF)[SegmentedPeriod],
  periodStart: Date,
  periodEnd: Date,
  sortedSegments: GoalSegment[],
  wearPairs: WearPair[],
  now: Date,
  tz: string,
): SegmentedGoalProgress {
  const periodDays = calendarDaysBetween(periodStart, periodEnd, tz);
  if (periodDays <= 0) return NO_SEGMENTED_GOAL;

  const nowMs = now.getTime();
  let targetH = 0;
  let actualH = 0;

  // **Segmente können sich ÜBERLAPPEN** — und deshalb wird hier nicht blind summiert.
  // `reorderVorgabenDates` kürzt eine Vorgabe mit MANUELL gesetztem Enddatum bewusst NICHT auf den
  // Start der nächsten (`if (list[i].validUntilManual) continue`). Wer also Ziel A auf „bis 30.6."
  // datiert und danach Ziel B ab 1.6. anlegt, hat den Juni in beiden Fenstern. Würde man beide
  // addieren, stiegen Nenner UND Zähler über die Periode hinaus.
  //
  // Ein Tag gehört genau EINER Vorgabe: der zuletzt BEGONNENEN — derselben, die `getActiveVorgabe`
  // als die aktive wählt (`gueltigAb desc`). Deshalb von hinten nach vorn, mit einer Wasserlinie:
  // was eine spätere Vorgabe schon beansprucht hat, ist für die früheren verbraucht.
  let claimedFromMs = periodEnd.getTime();

  for (const seg of sortedSegments) {
    const startMs = Math.max(seg.gueltigAb.getTime(), periodStart.getTime());
    const endMs = Math.min(goalEffectiveEndMs(seg, tz), claimedFromMs);
    if (endMs <= startMs) continue; // berührt die Periode nicht oder ist schon vergeben

    // Vergeben ist vergeben, sobald ein Segment die Tage regiert — auch wenn es für DIESE Periode
    // nichts verlangt (Regel 2). Sonst zählte eine frühere, überlappende Vorgabe Tage mit, für die
    // inzwischen eine andere Regel galt.
    claimedFromMs = Math.min(claimedFromMs, startMs);
    const segSoll = seg[soll];
    if (segSoll == null) continue;

    const segStart = new Date(startMs);
    const days = calendarDaysBetween(segStart, new Date(endMs), tz);
    if (days <= 0) continue;

    // Nenner: das Perioden-Soll gleichmässig über die Periode verteilt, davon die Tage dieses
    // Segments. Ein Perioden-Soll trägt keine Wochentags- oder Saison-Information —
    // Gleichverteilung ist die einzige belegbare Lesart. Wer es feiner will, legt eigene Segmente
    // an (genau das tut die Keyholderin ja).
    targetH += (segSoll * days) / periodDays;

    // Zähler: NUR der bereits verstrichene Teil DESSELBEN Fensters — durch die Wasserlinie
    // überschneidungsfrei, deshalb darf hier summiert werden.
    const elapsedEndMs = Math.min(endMs, nowMs);
    if (elapsedEndMs > startMs) actualH += wearingHoursFromPairs(wearPairs, segStart, new Date(elapsedEndMs));
  }

  // Ein Ziel von 0 ist keine bewertbare Zeile — dieselbe Truthy-Regel wie `hasVisibleGoalRow`.
  return targetH > 0 ? { targetH, actualH } : NO_SEGMENTED_GOAL;
}

/**
 * Ein Auswerter für EINE Segment-Lage: sortiert einmal, bewertet danach beliebig viele Fenster.
 *
 * Die Sortierung hängt weder an der Periode noch am Fenster — und Kalender wie Monatsübersicht
 * bewerten Dutzende Fenster über denselben Segmenten (vier Monate mal ihre Wochenzeilen, dazu je
 * Kategorie). Sie je Aufruf neu zu bilden wäre Abfall, den niemand sieht.
 *
 * **Ohne Aktiv-Gate.** Kalender und Monatsübersicht zeigen VERGANGENE Zeiträume; dort gibt es kein
 * „aktives Ziel", an dem die Sichtbarkeit hängen könnte (Regel 1) — über einen abgelaufenen Monat
 * entscheidet allein, was in seinen Tagen verlangt war. `targetH` bleibt `null`, wenn die Segmente
 * dieses Fensters nichts fordern, und das ist dort die ganze Sichtbarkeitsregel.
 *
 * Daraus folgt ein bewusster Unterschied zur Ziel-Karte: Hat das aktive Ziel für den laufenden Monat
 * kein Soll, ein früheres Segment desselben Monats aber schon, so zeigt die KARTE keine Monatszeile
 * (Regel 1), der KALENDER dagegen den anteiligen Wert der Tage, in denen etwas verlangt war. Beides
 * ist richtig — die Karte sagt „was gilt jetzt", der Kalender „was galt damals".
 *
 * `now` begrenzt weiterhin den Ist-Wert: ein laufender Monat hat noch keine Zukunft.
 */
export function segmentedGoalWindows(
  segments: GoalSegment[],
  wearPairs: WearPair[],
  now: Date,
  tz: string,
): (period: SegmentedPeriod, periodStart: Date, periodEnd: Date) => SegmentedGoalProgress {
  const sorted = byStartDesc(segments);
  return (period, periodStart, periodEnd) =>
    segmentedGoalOver(SOLL_OF[period], periodStart, periodEnd, sorted, wearPairs, now, tz);
}

/**
 * Die vier Perioden-Ziele einer Vorgabe MIT den Ist-Stunden, die dazugehören — der EINE Aufruf,
 * den jede Ziel-Anzeige macht.
 *
 * Der Tag kommt aus `resolveDayGoalTarget` (dort ist „jetzt" eindeutig) und seinen Ist-Wert rechnet
 * der Aufrufer weiter selbst; Woche/Monat/Jahr kommen samt Ist aus den Segmenten. Dass die drei
 * Ist-Werte hier MIT zurückkommen und nicht beim Aufrufer entstehen, ist der Kern: genau daran lief
 * es am 23.08.2026 auseinander.
 *
 * `changedInPeriod` ist für die segmentierten Perioden immer `false`: eine „geteilte" Woche gibt es
 * nicht mehr, sie wird anteilig bewertet statt unterdrückt.
 *
 * Ohne bewertbare Zeile fällt der Ist-Wert auf die schlichte Perioden-Tragezeit
 * (`periodStart..now`) zurück — die Zahl wird auch ohne Ziel als reine Kennzahl angezeigt, eine 0
 * stünde dort falsch. Der Rückfall wird HIER gerechnet und nicht vom Aufrufer übergeben: ein
 * Aufrufer, der am Zähler mitrechnet, während diese Funktion den Nenner besitzt, ist exakt die
 * Form, aus der der 23.08.-Fehler entstand.
 */
export function resolveGoalRow(
  vorgabe: (GoalWindow & VorgabePeriodTargets) | null,
  segments: GoalSegment[],
  wearPairs: WearPair[],
  now: Date,
  tz: string,
): { goal: VorgabeTargets; actualH: Record<SegmentedPeriod, number> } {
  const day = resolveDayGoalTarget(vorgabe, now, tz);
  const targetH = { day: day.targetH } as ByPeriod<number | null>;
  const changedInPeriod = { day: day.changedInPeriod } as GoalChangedInPeriod;
  const actualH = {} as Record<SegmentedPeriod, number>;
  // Einmal sortiert für alle drei Perioden — die Reihenfolge hängt nicht von der Periode ab.
  const goalIn = segmentedGoalWindows(segments, wearPairs, now, tz);

  for (const period of SEGMENTED_PERIODS) {
    const { start, end } = periodBounds(period, now, tz);
    const r = vorgabe == null || vorgabe[SOLL_OF[period]] == null
      ? NO_SEGMENTED_GOAL // Regel 1: Sichtbarkeit hängt am aktiven Ziel
      : goalIn(period, start, end);
    targetH[period] = r.targetH;
    changedInPeriod[period] = false;
    actualH[period] = r.targetH != null ? r.actualH : wearingHoursFromPairs(wearPairs, start, now);
  }

  return { goal: { targetH, changedInPeriod }, actualH };
}

/** Die Segment-Ist-Werte unter den Bestandsnamen von `WearHours` — der Tag bleibt, wie er kam.
 *  Die Zuordnung stand an vier Stellen ausgeschrieben; sie gehört dorthin, wo die Perioden-Schlüssel
 *  herkommen. */
export const segmentHours = (a: Record<SegmentedPeriod, number>) =>
  ({ wocheH: a.week, monatH: a.month, jahrH: a.year });

/** Das KG-Trainingsziel als führende Zeile der „Trainingsvorgaben"-Karte — die vier Tragestunden
 *  plus die aufgelösten Ziele. Bewusst OHNE Live-Tick und Kategorie-Icon: gezeigt nur, wenn KEINE
 *  Sperre läuft (sonst trägt es die grüne Session-Karte). Von `buildKgGoalRow` gebaut und von
 *  `CategoryGoalsLive` gerendert. */
export interface KgGoalRow extends WearHours {
  goal: VorgabeTargets;
}

/**
 * Das KG-Trainingsziel als führende Zeile der „Trainingsvorgaben"-Karte, oder `null` — die EINE
 * Herleitung, geteilt von der Übersicht des Trägers und der Admin-Übersicht der Keyholderin, damit
 * beide dieselbe Zeile zeigen (die Admin-Sicht liess sie zuvor ganz weg).
 *
 * `coveredBySessionCard` blendet sie aus, wo die grüne Session-Karte das Ziel bei laufender Sperre
 * ohnehin trägt. `hasVisibleGoalRow` verhindert die Überschrift über einer leeren Liste
 * (Starttag/unbewertete Periode).
 *
 * Woche/Monat/Jahr aus `hours` werden ÜBERSCHRIEBEN: der Aufrufer rechnet sie über
 * `periodStart..now`, die Ziel-Zeilen brauchen aber den Ist-Wert über die abgedeckten
 * Segment-Fenster. Nur so gehören Zähler und Nenner zusammen. Der Tag bleibt, wie er kam.
 */
export function buildKgGoalRow(
  activeVorgabe: (GoalWindow & VorgabePeriodTargets) | null,
  segments: GoalSegment[],
  wearPairs: WearPair[],
  hours: WearHours,
  now: Date,
  tz: string,
  coveredBySessionCard: boolean,
): KgGoalRow | null {
  if (coveredBySessionCard || !activeVorgabe) return null;
  const { goal, actualH } = resolveGoalRow(activeVorgabe, segments, wearPairs, now, tz);
  return hasVisibleGoalRow(goal.targetH)
    ? { ...hours, wocheH: actualH.week, monatH: actualH.month, jahrH: actualH.year, goal }
    : null;
}
