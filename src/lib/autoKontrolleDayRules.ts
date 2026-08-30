import { HHMM, INVALID_TIME } from "@/lib/constants";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import { parseWeekdayMask, weekdayMaskHas, weekdayMaskKeys, weekdayMaskValid } from "@/lib/weekdays";

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
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: AutoInspectionDayRule[] = [];
  for (const r of arr) {
    const parsed = ruleShape(r);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Die SCHREIB-Regel der ganzen Liste: stabiler Fehler-Code samt Position, `null` heisst gültig.
 *
 * Der Lese-Pfad verwirft Murks still; für einen Schreiber wäre genau das die Falle — eine Regel mit
 * kaputter Uhrzeit käme als `ok` zurück und wäre in Wahrheit nicht gespeichert. Der `index` sagt,
 * WELCHE stört (Vorbild `cleaningWindowListProblem`).
 */
export function autoInspectionDayRulesProblem(raw: unknown): { code: ServiceErrorCode; index?: number } | null {
  if (!Array.isArray(raw)) return { code: INVALID_TIME };
  if (raw.length > AUTO_INSPECTION_DAY_RULES_MAX) return { code: "INSPECTION_DAY_RULES_TOO_MANY" };
  for (const [index, r] of raw.entries()) {
    const rule = (r ?? {}) as Record<string, unknown>;
    if (typeof rule.ruheVon !== "string" || !HHMM.test(rule.ruheVon)) return { code: INVALID_TIME, index };
    if (typeof rule.ruheBis !== "string" || !HHMM.test(rule.ruheBis)) return { code: INVALID_TIME, index };
    if (rule.fensterVon !== undefined && !optionalTime(rule.fensterVon)) return { code: INVALID_TIME, index };
    if (rule.fensterBis !== undefined && !optionalTime(rule.fensterBis)) return { code: INVALID_TIME, index };
    // Ein halbes Auslöse-Fenster gibt es nicht: der Planer liest es dann als „gar keins" und plant
    // still über den ganzen Tag — das Gegenteil dessen, was der Schreiber gerade eingestellt hat.
    if ((rule.fensterVon ? 1 : 0) !== (rule.fensterBis ? 1 : 0)) return { code: INVALID_TIME, index };
    // Wie bei den Fenstern: `days` darf fehlen (dann alle Tage — die Regel wird dann zum neuen
    // Normalfall), aber eine Null-Maske wäre eine Ausnahme, die nie greift.
    if (rule.days !== undefined && !weekdayMaskValid(rule.days)) return { code: INVALID_TIME, index };
  }
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
export function timesForDay<S extends AutoInspectionDayTimes>(base: S, rulesRaw: unknown, isoDay: number): S {
  const rule = dayRuleFor(parseAutoInspectionDayRules(rulesRaw), isoDay);
  if (!rule) return base;
  const { ruheVon, ruheBis, fensterVon, fensterBis } = rule;
  return { ...base, ruheVon, ruheBis, fensterVon, fensterBis };
}

/** Eine Regel als eine Zeile für Maschinen-Sichten: „tue 19:00-06:00 window 08:00-12:00". */
export function formatAutoInspectionDayRule(r: AutoInspectionDayRule): string {
  const window = r.fensterVon && r.fensterBis ? ` window ${r.fensterVon}-${r.fensterBis}` : "";
  return `${weekdayMaskKeys(r.days)} quiet ${r.ruheVon}-${r.ruheBis}${window}`;
}
