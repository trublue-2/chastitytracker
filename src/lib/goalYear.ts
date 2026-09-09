/**
 * Die JAHRES-Zeile eines Trainingsziels — Ziel UND Ist aus einer Hand.
 *
 * Warum das Jahr ein eigenes Modul bekommt, während Tag/Woche/Monat in `goalFulfillment.ts`
 * bleiben: nur das Jahr überspannt regelmässig einen REGELWECHSEL. Wer im Juni von „30 %" auf
 * „50 %" hochschraubt, legt dafür eine neue Vorgabe ohne Enddatum an; `reorderVorgabenDates`
 * verkettet die alte darauf. Für Tag/Woche/Monat ist „jetzt" danach eindeutig (das aktive Ziel),
 * für das Jahr nicht — es enthält beide Phasen.
 *
 * **Der Grundsatz (Entscheidung des Keyholders, 09.09.2026):** *Jeder Tag wird nach der Regel
 * bewertet, die an diesem Tag galt.* Jan–Mai zählen mit 30 %, ab Juni mit 50 %; das Jahresziel ist
 * die Summe dessen, was an den einzelnen Tagen tatsächlich verlangt war. Die Alternative wäre
 * gewesen, das neue Ziel rückwirkend aufs ganze Jahr zu legen („aufholen") — das unterstellt der
 * Keyholderin aber, sie wolle die Vergangenheit umdeuten. Die Mischrechnung unterstellt nichts.
 * Und wer die Aufhol-Variante WILL, drückt sie ohnehin aus, indem sie das Ziel ab 1.1. datiert
 * statt eine Kette anzulegen — die Absicht steckt im Startdatum, nicht im Ratespiel.
 *
 * **Zwei Regeln, die zusammengehören:**
 *
 * 1. **Sichtbarkeit hängt am AKTIVEN Ziel.** Trägt das gerade aktive Ziel kein `minProJahrH`, gibt
 *    es keine Jahres-Zeile — auch dann nicht, wenn ein früheres Segment des Jahres eines hatte.
 *    Ebenso: läuft gerade gar kein Ziel, zeigt der Block nichts (das entscheiden die Aufrufer).
 * 2. **Der WERT aggregiert über die Segmente** des laufenden Jahres. Ein Segment ohne eigenes
 *    Jahresziel steuert dabei WEDER Tage NOCH Soll bei — „jedes Ziel für sich": es verwässert die
 *    Quote nicht, weil in seinen Tagen fürs Jahr nichts verlangt war.
 *
 * **Zähler und Nenner entstehen hier gemeinsam, und das ist der ganze Punkt.** Am 23.08.2026
 * meldete `period_summary` 1013 % Erfüllung, weil ein anteilig gekürztes Ziel (Nenner: Restwoche)
 * den Ist-Wert der GANZEN Woche gegenüberstand. Der Fehler war nicht das Anteilige, sondern dass es
 * nur auf einer Seite stattfand. Deshalb liefert diese Funktion beides — wer nur `targetH` nimmt
 * und den Ist-Wert weiter selbst über `yearStart..now` rechnet, baut denselben Bug neu.
 */

import {
  calendarDaysBetween, getYearStart, wearingHoursFromPairs, type WearHours, type WearPair,
} from "@/lib/utils";
import {
  periodBounds, goalEffectiveEndMs, resolveGoalTargets, hasVisibleGoalRow,
  type GoalWindow, type VorgabePeriodTargets, type VorgabeTargets,
} from "@/lib/goalFulfillment";

/** Ein Segment des Jahres: Gültigkeitsfenster (samt `validUntilManual` für die einschliessende
 *  Lesart des Endes) plus sein eigenes Jahresziel. */
export interface YearGoalSegment extends GoalWindow {
  minProJahrH: number | null;
}

/** Ziel und Ist der Jahres-Zeile. `targetH: null` = keine bewertbare Zeile (dann ist `actualH` 0
 *  und bedeutungslos) — dieselbe Konvention wie `PeriodTarget.targetH` in `goalFulfillment.ts`. */
export interface YearGoalProgress {
  targetH: number | null;
  actualH: number;
}

const NO_YEAR_GOAL: YearGoalProgress = { targetH: null, actualH: 0 };

/**
 * Ziel und Ist der Jahres-Zeile für das Jahr, in dem `now` liegt.
 *
 * `active` entscheidet nur über die SICHTBARKEIT (Regel 1), `segments` über den WERT (Regel 2).
 * `segments` darf ruhig alle Vorgaben der Kategorie enthalten — auch alte Jahre und solche ohne
 * Jahresziel; beide fallen hier heraus. Das erspart jedem Aufrufer eine eigene Vorauswahl, die
 * sonst an fünf Stellen leicht verschieden ausfiele.
 *
 * `wearPairs` sind die Trage-Paare DIESER Kategorie (Wanduhr-Zeit, also bereits verschmolzen), und
 * sie müssen bis zum Jahresanfang zurückreichen — sonst fehlt dem Ist-Wert der Anfang des Jahres.
 */
export function resolveYearGoal(
  active: VorgabePeriodTargets | null,
  segments: YearGoalSegment[],
  wearPairs: WearPair[],
  now: Date,
  tz: string,
): YearGoalProgress {
  // Regel 1: ohne Jahresziel auf dem aktiven Ziel gibt es die Zeile nicht — unabhängig davon, was
  // frühere Segmente des Jahres verlangt haben.
  if (active?.minProJahrH == null) return NO_YEAR_GOAL;

  const { start: yearStart, end: yearEnd } = periodBounds("year", now, tz);
  const yearDays = calendarDaysBetween(yearStart, yearEnd, tz);
  if (yearDays <= 0) return NO_YEAR_GOAL;

  const nowMs = now.getTime();
  let targetH = 0;
  let actualH = 0;

  // **Segmente können sich ÜBERLAPPEN** — und deshalb wird hier nicht blind summiert.
  // `reorderVorgabenDates` kürzt eine Vorgabe mit MANUELL gesetztem Enddatum bewusst NICHT auf den
  // Start der nächsten (`if (list[i].validUntilManual) continue`). Wer also Ziel A auf „bis 30.6."
  // datiert und danach Ziel B ab 1.6. anlegt, hat den Juni in beiden Fenstern. Würde man beide
  // Fenster addieren, stiegen Nenner UND Zähler über das Jahr hinaus (395 statt 365 Tage, Juni-
  // Stunden doppelt).
  //
  // Ein Tag gehört genau EINER Vorgabe: der zuletzt BEGONNENEN — derselben, die `getActiveVorgabe`
  // als die aktive wählt (`gueltigAb desc`). Deshalb von hinten nach vorn, mit einer Wasserlinie:
  // was eine spätere Vorgabe schon beansprucht hat, ist für die früheren verbraucht.
  const byStartDesc = [...segments].sort((a, b) => b.gueltigAb.getTime() - a.gueltigAb.getTime());
  let claimedFromMs = yearEnd.getTime();

  for (const seg of byStartDesc) {
    const startMs = Math.max(seg.gueltigAb.getTime(), yearStart.getTime());
    const endMs = Math.min(goalEffectiveEndMs(seg, tz), claimedFromMs);
    if (endMs <= startMs) continue; // berührt das laufende Jahr nicht oder ist schon vergeben

    // Vergeben ist vergeben, sobald ein Segment die Tage regiert — auch wenn es fürs Jahr nichts
    // verlangt (Regel 2). Sonst zählte eine frühere, überlappende Vorgabe Tage mit, für die
    // inzwischen eine andere Regel galt.
    claimedFromMs = Math.min(claimedFromMs, startMs);
    if (seg.minProJahrH == null) continue;

    const segStart = new Date(startMs);
    const days = calendarDaysBetween(segStart, new Date(endMs), tz);
    if (days <= 0) continue;

    // Nenner: der Jahreswert gleichmässig über das Jahr verteilt, davon die Tage dieses Segments.
    // Ein Jahresziel trägt keine Saison-Information — Gleichverteilung ist die einzige belegbare
    // Lesart. Wer es feiner will, legt eigene Segmente an (genau das tut die Keyholderin ja).
    targetH += (seg.minProJahrH * days) / yearDays;

    // Zähler: NUR der bereits verstrichene Teil DESSELBEN Fensters — durch die Wasserlinie
    // überschneidungsfrei, deshalb darf hier summiert werden.
    const elapsedEndMs = Math.min(endMs, nowMs);
    if (elapsedEndMs > startMs) actualH += wearingHoursFromPairs(wearPairs, segStart, new Date(elapsedEndMs));
  }

  // Ein Ziel von 0 ist keine bewertbare Zeile — dieselbe Truthy-Regel wie `hasVisibleGoalRow`.
  return targetH > 0 ? { targetH, actualH } : NO_YEAR_GOAL;
}

/**
 * Die vier Perioden-Ziele MIT aggregiertem Jahr — der EINE Aufruf, den jede Ziel-Anzeige macht.
 *
 * Tag/Woche/Monat kommen unverändert aus `resolveGoalTargets` (dort ist „jetzt" eindeutig), nur der
 * Jahres-Platz wird durch die Segment-Summe ersetzt. Der dazugehörige Ist-Wert kommt als
 * `yearActualH` MIT zurück und nicht etwa aus einer zweiten Rechnung beim Aufrufer — genau daran
 * ist es am 23.08.2026 auseinandergelaufen.
 *
 * `changedInPeriod.year` ist damit immer `false`: ein „geteiltes" Jahr gibt es nicht mehr, es wird
 * anteilig bewertet statt unterdrückt.
 *
 * Ohne bewertbare Jahres-Zeile fällt `yearActualH` auf die schlichte Jahres-Tragezeit
 * (`yearStart..now`) zurück — die Zahl wird auch ohne Ziel als reine Kennzahl angezeigt, eine 0
 * stünde dort falsch. Der Rückfall wird HIER gerechnet und nicht vom Aufrufer übergeben: ein
 * Aufrufer, der am Zähler mitrechnet, während diese Funktion den Nenner besitzt, ist exakt die
 * Form, aus der der 23.08.-Fehler entstand. Er kostet auch nichts, wo es ein Ziel gibt — dann wird
 * er gar nicht erst berechnet.
 */
export function resolveGoalTargetsWithYear(
  vorgabe: (GoalWindow & VorgabePeriodTargets) | null,
  segments: YearGoalSegment[],
  wearPairs: WearPair[],
  now: Date,
  tz: string,
): { goal: VorgabeTargets; yearActualH: number } {
  const base = resolveGoalTargets(vorgabe, now, tz);
  const year = resolveYearGoal(vorgabe, segments, wearPairs, now, tz);
  return {
    goal: {
      targetH: { ...base.targetH, year: year.targetH },
      changedInPeriod: { ...base.changedInPeriod, year: false },
    },
    yearActualH: year.targetH != null
      ? year.actualH
      : wearingHoursFromPairs(wearPairs, getYearStart(now, tz), now),
  };
}

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
 * (Starttag/geteilte Periode).
 *
 * `hours.jahrH` wird bewusst ÜBERSCHRIEBEN: der Aufrufer rechnet es über `yearStart..now`, die
 * Jahres-Zeile braucht aber den Ist-Wert über die abgedeckten Segment-Fenster. Nur so gehören
 * Zähler und Nenner zusammen.
 */
export function buildKgGoalRow(
  activeVorgabe: (GoalWindow & VorgabePeriodTargets) | null,
  segments: YearGoalSegment[],
  wearPairs: WearPair[],
  hours: WearHours,
  now: Date,
  tz: string,
  coveredBySessionCard: boolean,
): KgGoalRow | null {
  if (coveredBySessionCard || !activeVorgabe) return null;
  const { goal, yearActualH } = resolveGoalTargetsWithYear(activeVorgabe, segments, wearPairs, now, tz);
  return hasVisibleGoalRow(goal.targetH) ? { ...hours, jahrH: yearActualH, goal } : null;
}
