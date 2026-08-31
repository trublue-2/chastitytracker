import { HHMM, INVALID_TIME, TIME_RANGE_INVALID } from "@/lib/constants";
import { hhmmToMinutes } from "@/lib/utils";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import { parseWeekdayMask, weekdayMaskHas, weekdayMaskKeys, weekdayMaskValid } from "@/lib/weekdays";
import { listProblem, parseJsonList, type ListProblem } from "@/lib/jsonList";

/**
 * Tagesspezifische Kontroll-Fenster: **die Ausnahme vom Grundstand, nicht der Grundstand selbst.**
 *
 * Die vier Bestands-Spalten (`autoKontrolleRuheVon/Bis`, `autoKontrolleFensterVon/Bis`) bleiben, was
 * an einem gewöhnlichen Tag gilt. Wer an einzelnen Wochentagen etwas anderes will, legt hier eine
 * Regel ab; sie ERSETZT für diesen Tag beide Fenster-Paare.
 *
 * **Warum eine Ausnahme-Liste und nicht sieben vollständige Tages-Einstellungen.** Der übliche Fall
 * ist „wie immer, ausser dienstags". Sieben Fassungen zwängen die Keyholderin, dieselben Zeiten
 * sechsmal abzuschreiben, und jede spätere Änderung am Normalfall wäre eine Änderung an sechs
 * Stellen — mit der Aussicht, eine davon zu vergessen.
 *
 * **Warum die Auflösung VOR der Planung steht und nicht darin.** Der Planer (`autoKontrolleService`)
 * rechnet mit genau einem Schlaf- und einem Auslöse-Fenster: Wach-Fenster, Segmente, die
 * DST-sichere Minuten-Achse, das Kappen der Frist am Schlaf-Beginn. Er plant dabei immer nur EINEN
 * Tag. Wird der Tag also vorher aufgelöst ({@link timesForDay}), bleibt diese ganze Arithmetik
 * unberührt — es gibt keinen Sonderfall im Planer, nur einen anderen Satz Zeiten vor ihm. Eine
 * Liste MEHRERER Auslöse-Fenster pro Tag ginge nicht so: sie zwänge `spreadOverDay` und
 * `fillFreeGaps` auf eine Vereinigung von Intervallen um.
 *
 * Das Modul bleibt bewusst arm: Form, Prüfung, Auflösung. Was eine Kombination BEDEUTET (ein
 * Auslöse-Fenster, das ganz im Schlaf liegt, etwa) entscheidet der Dienst — dort stehen die übrigen
 * feldübergreifenden Regeln, und nur dort ist die Fenster-Arithmetik zu Hause.
 */

/** Die vier Zeiten EINES Tages — der Ausschnitt der Settings, den eine Regel ersetzt. Als eigener
 *  Typ, damit dieses Modul `AutoKontrolleSettings` nicht importieren muss: der Dienst importiert
 *  hierher, nicht umgekehrt. */
export interface AutoInspectionDayTimes {
  ruheVon: string;
  ruheBis: string;
  /** "" = an diesem Tag kein festes Auslöse-Fenster (dann gilt das ganze Wach-Fenster). */
  fensterVon: string;
  fensterBis: string;
}

export interface AutoInspectionDayRule extends AutoInspectionDayTimes {
  /** Bitmaske der Wochentage (`weekdays.ts`), an denen diese Ausnahme gilt. */
  days: number;
}

/**
 * Höchstzahl der Ausnahmen. Sieben, weil eine Woche sieben Tage hat: mehr Regeln können nichts
 * ausdrücken, was sieben nicht ausdrücken — je Tag gewinnt ohnehin nur eine. Die Grenze ist damit
 * keine willkürliche Zahl, sondern die Sättigung.
 */
export const AUTO_INSPECTION_DAY_RULES_MAX = 7;

// ── Festes Auslöse-Fenster ─────────────────────────────────────────────────────
//
// Die beiden Prädikate stehen HIER und nicht mehr im Planer, obwohl der sie liest: sie sprechen über
// EINEN Tag (`AutoInspectionDayTimes`), nicht über die Einstellungen als Ganzes — und die
// Schreib-Regel unten braucht sie. Andersherum importierte dieses Modul den Planer, und der
// importiert wiederum `queries` → `cleaningService`; der Zyklus wäre die Folge einer Zuordnung, die
// ohnehin nicht stimmte.

/** Parst das optionale feste Auslöse-Fenster (HH:MM–HH:MM). Gültig NUR, wenn beide Zeiten valide sind
 *  UND Von < Bis (ein festes Fenster wrappt bewusst nicht über Mitternacht); sonst null → Fallback aufs
 *  Wach-Fenster. "" (leer, Default) → null. */
export function fixedWindowMinutes(s: { fensterVon: string; fensterBis: string }): { start: number; end: number } | null {
  if (!HHMM.test(s.fensterVon) || !HHMM.test(s.fensterBis)) return null;
  const start = hhmmToMinutes(s.fensterVon);
  const end = hhmmToMinutes(s.fensterBis);
  return end > start ? { start, end } : null;
}

/** Liegt das feste Auslöse-Fenster VOLLSTÄNDIG im Schlaf-Fenster? Dann überspringt der Planer jeden
 *  Trigger (`isInQuietMinutes`) und der Tag bleibt lautlos leer. Die Schreib-Seite lehnt so eine
 *  Kombination damit ab, statt sie stumm wirkungslos zu speichern. Das Fenster wrappt bewusst nicht
 *  (siehe {@link fixedWindowMinutes}), das Schlaf-Fenster schon. */
export function triggerWindowAllQuiet(s: AutoInspectionDayTimes): boolean {
  const fixed = fixedWindowMinutes(s);
  if (!fixed) return false;
  const von = hhmmToMinutes(s.ruheVon);
  const bis = hhmmToMinutes(s.ruheBis);
  if (von === bis) return false; // kein Schlaf
  return von < bis
    ? fixed.start >= von && fixed.end <= bis          // 02:00–05:00: Fenster liegt darin
    : fixed.start >= von || fixed.end <= bis;         // 22:00–06:00 (wrap): Fenster im Abend- ODER Morgen-Ast
}

/** Eine Uhrzeit, die auch "" sein darf (die beiden Fenster-Felder). */
const optionalTime = (v: unknown): v is string => typeof v === "string" && (v === "" || HHMM.test(v));

/** Die LESE-Regel EINER Zeile: Form, sonst `null`. Tolerant gegenüber Bestand — sie beurteilt, was
 *  gespeichert IST, und eine Zeile nachträglich strenger zu lesen hiesse, sie der Keyholderin
 *  lautlos wegzunehmen (dasselbe Verhältnis wie bei den Reinigungs-Fenstern). */
function ruleShape(r: unknown): AutoInspectionDayRule | null {
  const raw = (r ?? {}) as Record<string, unknown>;
  if (typeof raw.ruheVon !== "string" || !HHMM.test(raw.ruheVon)) return null;
  if (typeof raw.ruheBis !== "string" || !HHMM.test(raw.ruheBis)) return null;
  const fensterVon = optionalTime(raw.fensterVon) ? raw.fensterVon : "";
  const fensterBis = optionalTime(raw.fensterBis) ? raw.fensterBis : "";
  return { days: parseWeekdayMask(raw.days), ruheVon: raw.ruheVon, ruheBis: raw.ruheBis, fensterVon, fensterBis };
}

/** Parst die Liste aus `User.autoKontrolleDayRules` (JSON-String ODER Array). Murks fällt still weg. */
export function parseAutoInspectionDayRules(raw: unknown): AutoInspectionDayRule[] {
  return parseJsonList(raw, ruleShape);
}

/**
 * Die SCHREIB-Regel der ganzen Liste: stabiler Fehler-Code samt Position, `null` heisst gültig.
 *
 * Der Lese-Pfad verwirft Murks still; für einen Schreiber wäre genau das die Falle — eine Regel mit
 * kaputter Uhrzeit käme als `ok` zurück und wäre in Wahrheit nicht gespeichert. Der `index` sagt,
 * WELCHE stört (Vorbild `cleaningWindowListProblem`).
 */
export function autoInspectionDayRulesProblem(raw: unknown): ListProblem | null {
  return listProblem(
    raw,
    { max: AUTO_INSPECTION_DAY_RULES_MAX, notAListCode: INVALID_TIME, tooManyCode: "INSPECTION_DAY_RULES_TOO_MANY" },
    dayRuleProblem,
  );
}

/** Die SCHREIB-Regel EINER Ausnahme. */
function dayRuleProblem(r: unknown): ServiceErrorCode | null {
  const rule = (r ?? {}) as Record<string, unknown>;
  if (typeof rule.ruheVon !== "string" || !HHMM.test(rule.ruheVon)) return INVALID_TIME;
  if (typeof rule.ruheBis !== "string" || !HHMM.test(rule.ruheBis)) return INVALID_TIME;
  if (rule.fensterVon !== undefined && !optionalTime(rule.fensterVon)) return INVALID_TIME;
  if (rule.fensterBis !== undefined && !optionalTime(rule.fensterBis)) return INVALID_TIME;
  // Ein halbes Auslöse-Fenster gibt es nicht: der Planer liest es dann als „gar keins" und plant
  // still über den ganzen Tag — das Gegenteil dessen, was der Schreiber gerade eingestellt hat.
  if ((rule.fensterVon ? 1 : 0) !== (rule.fensterBis ? 1 : 0)) return INVALID_TIME;
  // Und dasselbe für ein Fenster, dessen Ende vor dem Anfang liegt. Die Frage stellt der PLANER
  // selbst (`fixedWindowMinutes` — dieselbe Funktion, die das Fenster später liest), damit hier
  // keine zweite Definition von „gültiges Fenster" entsteht. Ohne diese Zeile war „12:00–09:00"
  // eine Regel, die der Träger auf seiner Regel-Seite sah und die der Planer stumm überging —
  // genau das, wogegen dieses Modul gebaut ist.
  if (rule.fensterVon && !fixedWindowMinutes({ fensterVon: rule.fensterVon as string, fensterBis: rule.fensterBis as string })) {
    return TIME_RANGE_INVALID;
  }
  // Wie bei den Fenstern: `days` darf fehlen (dann alle Tage — die Regel wird dann zum neuen
  // Normalfall), aber eine Null-Maske wäre eine Ausnahme, die nie greift.
  if (rule.days !== undefined && !weekdayMaskValid(rule.days)) return INVALID_TIME;
  return null;
}

/** Die Regel, die an diesem ISO-Wochentag gilt — die ERSTE passende. Die Reihenfolge ist damit die
 *  Rangfolge: „dienstags so, werktags sonst so" schreibt man als Dienstag-Regel VOR die Werktags-Regel.
 *  Keine passende: `null`, dann gilt der Grundstand. */
export function dayRuleFor(rules: AutoInspectionDayRule[], isoDay: number): AutoInspectionDayRule | null {
  return rules.find((r) => weekdayMaskHas(r.days, isoDay)) ?? null;
}

/**
 * Der Grundstand mit den Zeiten des Tages — die eine Stelle, an der eine Ausnahme wirksam wird.
 *
 * Generisch über den Settings-Typ, damit alle übrigen Felder (Anzahl, Fristen, „nur bei Sperre")
 * unangetastet durchgehen und der Dienst seinen eigenen Typ behält.
 */
export function timesForDay<S extends AutoInspectionDayTimes>(
  base: S, rules: AutoInspectionDayRule[], isoDay: number,
): S {
  const rule = dayRuleFor(rules, isoDay);
  if (!rule) return base;
  const { ruheVon, ruheBis, fensterVon, fensterBis } = rule;
  return { ...base, ruheVon, ruheBis, fensterVon, fensterBis };
}

/** Eine Regel als eine Zeile für Maschinen-Sichten: „tue 19:00-06:00 window 08:00-12:00". */
export function formatAutoInspectionDayRule(r: AutoInspectionDayRule): string {
  const window = r.fensterVon && r.fensterBis ? ` window ${r.fensterVon}-${r.fensterBis}` : "";
  return `${weekdayMaskKeys(r.days)} quiet ${r.ruheVon}-${r.ruheBis}${window}`;
}
