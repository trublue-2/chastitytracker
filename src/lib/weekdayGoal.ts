import { listProblem, parseJsonList, type ListProblem } from "@/lib/jsonList";
import { firstWeekdayRule, isoWeekdayInTZ, parseWeekdayMask, weekdayMaskValid } from "@/lib/weekdays";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/**
 * Wochentag-Ausnahmen des TAGES-Minimums eines Trainingsziels: **die Abweichung vom Grundstand, nicht
 * der Grundstand selbst.**
 *
 * Das Basis-Tagesziel (`TrainingVorgabe.minProTagH`) gilt an jedem Tag. Wer an einzelnen Wochentagen
 * ein anderes Tages-Soll will (Beispiel: werktags 6 h, Sa/So 16 h), legt hier eine Regel ab; sie
 * ERSETZT für ihre Wochentage den Basiswert. Nur die abweichenden Tage stehen in der Liste — ein Tag
 * ohne passende Regel behält `minProTagH`.
 *
 * **`hours: 0` ist eine gesetzte Ausnahme (Ruhetag), nicht „nicht gesetzt".** Ein Wochentag mit einer
 * 0-Regel hat an diesem Tag KEIN Tages-Soll; ein Wochentag ohne Regel fällt auf `minProTagH` zurück.
 * Genau deshalb löst {@link resolveDayTarget} über die Regel-EXISTENZ auf (`rule ? rule.hours : base`)
 * und nicht über einen Wahrheitswert — sonst verschwände der Ruhetag im Basiswert.
 *
 * **Speicherform wie die Auto-Kontroll-`dayRules`** (`autoKontrolleDayRules.ts`): eine JSON-Liste in
 * einer `String?`-Spalte, gelesen und geschrieben über dieselbe `jsonList`-Hülle. Das gibt den
 * toleranten Lese-Pfad (Murks fällt still weg, damit Bestand nicht scheitert) und die strenge
 * Schreib-Prüfung (welche Zeile stört) an EINER Stelle. Der Wochentag als Bitmaske kommt aus
 * `weekdays.ts`, damit dieselbe {@link WeekdayPicker}-Auswahl wie bei den Fenster-Familien passt.
 *
 * Nur TAGES-Ausnahmen: die Perioden-Summen (Woche/Monat/Jahr) bleiben unangetastet — ein Wochenziel
 * ist ein Deckel über sieben Tagen und keine Summe von sieben Wochentag-Werten.
 */

/** Eine Ausnahme: an den Wochentagen der Maske gilt `hours` als Tages-Soll (0 = Ruhetag). */
export interface WeekdayGoalRule {
  /** Bitmaske der Wochentage (`weekdays.ts`), an denen diese Ausnahme gilt. */
  days: number;
  /** Tages-Soll in Stunden an diesen Tagen; `0` = Ruhetag (kein Soll). */
  hours: number;
}

/** Höchstzahl der Ausnahmen — sieben, weil eine Woche sieben Tage hat (je Tag gewinnt ohnehin nur
 *  eine). Dieselbe Sättigungs-Begründung wie bei den Auto-Kontroll-Tagesregeln. */
export const WEEKDAY_GOAL_RULES_MAX = 7;

/** Physikalische Obergrenze eines Tages-Solls. Dieselbe Schranke wie das Basis-Tagesziel
 *  (`PERIOD_HOUR_CAP.tag` in `vorgabeService.ts`) — geprüft wird der Cap dort, zentral in
 *  `checkGoalPlausibility`. Hier steht nur die reine Zahl für die Struktur-Wache. */
const DAY_HOUR_CAP = 24;

/** Ein plausibler Stundenwert: eine endliche Zahl ≥ 0 (der Cap ≤ 24 gehört zu `checkGoalPlausibility`). */
function validHours(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** Die LESE-Regel EINER Zeile: Form, sonst `null`. Tolerant gegenüber Bestand — sie beurteilt, was
 *  gespeichert IST (dasselbe Verhältnis wie bei den Auto-Kontroll-Tagesregeln). */
function ruleShape(r: unknown): WeekdayGoalRule | null {
  const raw = (r ?? {}) as Record<string, unknown>;
  if (!validHours(raw.hours)) return null;
  return { days: parseWeekdayMask(raw.days), hours: raw.hours };
}

/** Parst die Liste aus `TrainingVorgabe.minProTagWochentage` (JSON-String ODER Array). Murks fällt
 *  still weg. */
export function parseWeekdayGoalRules(raw: unknown): WeekdayGoalRule[] {
  return parseJsonList(raw, ruleShape);
}

/** Die SCHREIB-Regel EINER Ausnahme (Struktur — nicht der 24-h-Cap, der in `checkGoalPlausibility`
 *  steht und dort auch für den MCP-dryRun greift). */
function ruleProblem(r: unknown): ServiceErrorCode | null {
  const rule = (r ?? {}) as Record<string, unknown>;
  if (!validHours(rule.hours)) return "GOAL_WEEKDAY_RULE_INVALID";
  // Eine Null-Maske wäre eine Ausnahme, die nie greift — wie bei den Fenster-Familien abgelehnt.
  // `days` darf fehlen (dann alle Tage: die Ausnahme wird zum neuen Normalfall des Tages-Solls).
  if (rule.days !== undefined && !weekdayMaskValid(rule.days)) return "GOAL_WEEKDAY_RULE_INVALID";
  return null;
}

/**
 * Die SCHREIB-Regel der ganzen Liste: stabiler Fehler-Code samt Position, `null` heisst gültig.
 * Der `index` sagt, WELCHE Zeile stört (Vorbild `autoInspectionDayRulesProblem`). Nur die STRUKTUR;
 * die Obergrenze prüft `checkGoalPlausibility` (geteilt mit dem MCP-dryRun).
 */
export function weekdayGoalRulesProblem(raw: unknown): ListProblem | null {
  return listProblem(
    raw,
    { max: WEEKDAY_GOAL_RULES_MAX, notAListCode: "GOAL_WEEKDAY_RULE_INVALID", tooManyCode: "GOAL_WEEKDAY_RULES_TOO_MANY" },
    ruleProblem,
  );
}

/** Liegt IRGENDEIN Ausnahme-Stundenwert über der Tages-Obergrenze? Für `checkGoalPlausibility`, das
 *  denselben Cap wie beim Basis-Tagesziel anlegt (`GOAL_DAY_TARGET_TOO_HIGH`). */
export function weekdayGoalRuleTooHigh(rules: readonly WeekdayGoalRule[]): boolean {
  return rules.some((r) => r.hours > DAY_HOUR_CAP);
}

/** Trägt die Liste überhaupt ein Tages-Soll bei (mindestens eine Ausnahme > 0)? Ein reiner Ruhetag
 *  (`hours: 0`) zählt NICHT als Ziel — sonst genügte „Sonntag frei" als ganzes Trainingsziel. Für
 *  `hasPeriodTarget`, damit ein „nur am Wochenende"-Ziel ohne Basiswert gültig ist. */
export function weekdayGoalRulesHaveTarget(rules: readonly WeekdayGoalRule[]): boolean {
  return rules.some((r) => r.hours > 0);
}

/**
 * **Die EINE Auflösung: das Tages-Soll dieses Wochentags** — die passende Ausnahme, sonst der
 * Basiswert. Entspricht `byWeekday[wochentag] ?? minProTagH`, aber über die Regel-EXISTENZ, damit ein
 * gesetzter Ruhetag (`hours: 0`) durchkommt statt vom `??` als „nicht gesetzt" verschluckt zu werden.
 *
 * Nimmt die bereits geparsten Regeln, weil sie an heissen Stellen (Kalender: je Tag-Zelle) nur EINMAL
 * je Vorgabe geparst werden sollen. Der bequeme Einstieg mit `Date`+tz ist {@link tagesSollFuer}.
 */
export function resolveDayTarget(base: number | null, rules: readonly WeekdayGoalRule[], isoDay: number): number | null {
  const rule = firstWeekdayRule(rules, isoDay);
  return rule ? rule.hours : base;
}

/** Das Tages-Soll einer Vorgabe an einem konkreten Kalendertag, in der Zeitzone des Trägers. Parst die
 *  Ausnahmen selbst — für Aufrufer mit genau einem Tag (z.B. das „heute"-Ziel). Wer viele Tage
 *  auflöst, parst einmal und ruft {@link resolveDayTarget}. */
export function tagesSollFuer(
  v: { minProTagH: number | null; minProTagWochentage?: string | null },
  at: Date,
  tz: string,
): number | null {
  const rules = parseWeekdayGoalRules(v.minProTagWochentage ?? null);
  // Ohne Ausnahmen gilt an jedem Tag der Basiswert — dann den Wochentag (und seine
  // `Intl`-Auflösung) gar nicht erst bestimmen.
  if (rules.length === 0) return v.minProTagH;
  return resolveDayTarget(v.minProTagH, rules, isoWeekdayInTZ(at, tz));
}
