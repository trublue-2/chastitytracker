import { effectiveAt, midnightOfLocalDate, round1, tzDateParts } from "@/lib/utils";
import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from "@/lib/constants";
import { coveragePct } from "@/lib/percent";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/**
 * Rechenkern des Gewichtstrackings: Einheiten, BMI, Zielgewicht und Fortschritt, Grössen-Historie.
 *
 * Bewusst **importfrei bis auf `constants`/`utils`/`percent`** (alle selbst client-tauglich), damit
 * Formulare, Statistik-Karte und die Server-Dienste dieselbe Rechnung teilen. Läge sie in einem
 * Service mit `prisma`-Import, hätte die Eingabemaske ihre eigene Kopie — und die erste
 * Abweichung fiele erst auf, wenn Anzeige und gespeicherter Wert auseinanderlaufen.
 *
 * Grundregel des Moduls: **gespeichert wird immer metrisch.** Die Einheit ist eine Eigenschaft
 * dessen, der schaut, nicht der Daten (siehe docs/gewicht-konzept.md, Abschnitt 2).
 */

// ── Einheiten ──────────────────────────────────────────────────────────────────────────────────

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export function isUnitSystem(v: unknown): v is UnitSystem {
  return typeof v === "string" && (UNIT_SYSTEMS as readonly string[]).includes(v);
}

/** Exakte Definition, kein gerundeter Faktor — sonst wandert der Wert bei jedem Hin und Her. */
export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

/**
 * Eingabe in der Anzeige-Einheit → kg. **Rundet nicht.**
 *
 * Gerundet wird beim Tippen (eine Kommastelle in der jeweiligen Einheit), nicht beim Speichern: wer
 * 165,4 lbs einträgt, meint 75,0242 kg. Auf 75,0 kg gerundet zeigte ihm die Anzeige 165,3 lbs
 * zurück — ein Wert, den er nie eingegeben hat.
 */
export function weightInputToKg(value: number, unit: UnitSystem): number {
  return unit === "imperial" ? value * KG_PER_LB : value;
}

/** kg → Anzeigewert in der Einheit des Betrachters, auf eine Kommastelle. */
export function weightForDisplay(kg: number, unit: UnitSystem): number {
  return round1(unit === "imperial" ? kg / KG_PER_LB : kg);
}

/** Körpergrösse: metrisch in cm, imperial in ganzen Zoll (die UI zerlegt sie in Fuss + Zoll). */
export function heightInputToCm(value: number, unit: UnitSystem): number {
  return Math.round(unit === "imperial" ? value * CM_PER_INCH : value);
}

/** cm → Zoll (imperial) bzw. cm (metrisch), ganzzahlig. */
export function heightForDisplay(cm: number, unit: UnitSystem): number {
  return Math.round(unit === "imperial" ? cm / CM_PER_INCH : cm);
}

/**
 * Ein Zahlen-Eingabefeld → Zahl in der ANZEIGE-Einheit, oder `null` für „nicht gesetzt".
 * Geteilt von Gewicht UND Körpergrösse — beide Felder tippt derselbe Mensch gleich.
 *
 * Das Komma ist Absicht: die deutsche Oberfläche lädt dazu ein, „75,6" zu tippen, und ein
 * `Number("75,6")` wäre `NaN` — also stillschweigend „keine Grenze" statt der eingegebenen Zahl.
 */
export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Der gespeicherte kg-Wert als Feld-Inhalt in der Einheit des Betrachters — leer, wenn ungesetzt. */
export function weightFieldValue(kg: number | null, unit: UnitSystem): string {
  return kg === null ? "" : String(weightForDisplay(kg, unit));
}

/** Zoll → `{feet, inches}` für die zweiteilige Eingabe. */
export function inchesToFeet(totalInches: number): { feet: number; inches: number } {
  const whole = Math.round(totalInches);
  return { feet: Math.floor(whole / INCHES_PER_FOOT), inches: whole % INCHES_PER_FOOT };
}

// ── BMI ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Body-Mass-Index. Bewusst **ungerundet**: die Anzeige rundet, die Vergleiche (Untergewicht-Schwelle,
 * Referenzbereich) rechnen mit dem vollen Wert. Ein auf 18,5 gerundeter BMI von 18,46 würde sonst
 * als „nicht untergewichtig" durchgehen.
 *
 * `null`, wenn keine Grösse bekannt ist — ohne sie gibt es keinen BMI, und eine erfundene
 * Standardgrösse wäre eine stille Falschaussage über den Träger.
 */
export function bmi(weightKg: number, heightCm: number | null | undefined): number | null {
  if (!heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * Ab welchem Sprung zum zuletzt gemessenen Wert das Formular nachfragt.
 *
 * Drei Kilo fangen den klassischen Zahlendreher (87,5 statt 78,5) und die falsch gelesene Anzeige,
 * ohne bei echten Tagesschwankungen von ein bis zwei Kilo ständig zu meckern. Eine Nachfrage, keine
 * Schranke: der Server prüft nur den harten Bereich (20–300 kg). Wer wirklich vier Kilo zugenommen
 * hat, soll das eintragen können, ohne sich zu rechtfertigen.
 */
export const WEIGHT_JUMP_CONFIRM_KG = 3;

/** WHO-Schwelle zum Untergewicht. Auslöser der Warnung beim Setzen eines Zielwerts (Abschnitt 7). */
export const BMI_UNDERWEIGHT = 18.5;

// ── Zielgewicht ────────────────────────────────────────────────────────────────────────────────

/**
 * Ein gesetztes Zielgewicht samt Herkunft.
 *
 * **Beide Seiten dürfen eines setzen, beide bleiben sichtbar — wirksam ist das der Keyholderin.**
 * Bis v5.3.3 war es ein Korridor, den sie nur weiten durfte; die Regel ist gestrichen. Sie stammte
 * aus der Sorge, jemand könnte eine unerreichbare Zahl von aussen verordnet bekommen — dagegen
 * steht jetzt die Untergewichts-Warnung, und der Rest ist eine Abmachung unter Erwachsenen.
 *
 * Der Wunsch des Trägers verschwindet dabei NICHT: er bleibt als eigene Zahl stehen, damit beide
 * sehen, worüber sie sich einig oder uneinig sind. Nimmt die Keyholderin ihre zurück, gilt wieder
 * seine.
 */
export interface WeightTarget {
  kg: number;
  /** Wann es gesetzt wurde — der Bezugspunkt des Fortschritts, nicht die Protokollzeile. */
  setAt: Date | null;
  source: "sub" | "keyholder";
}

/**
 * Die vier Ziel-Spalten, wie sie am `User` stehen.
 *
 * Als Typ hier und nicht als Prisma-Zeile: die Ableitungen darunter sind rein und werden auch von
 * Client-Komponenten gebraucht — sie dürfen kein `prisma` in den Browser ziehen.
 */
export interface TargetColumns {
  targetWeightKg: number | null;
  targetWeightSetAt: Date | null;
  targetWeightKeyholderKg: number | null;
  targetWeightKeyholderSetAt: Date | null;
}

/** Was der Träger sich selbst vorgenommen hat. */
export function subTargetOf(u: TargetColumns): WeightTarget | null {
  return u.targetWeightKg === null
    ? null
    : { kg: u.targetWeightKg, setAt: u.targetWeightSetAt, source: "sub" };
}

/** Was die Keyholderin gesetzt hat — für sich genommen. */
export function keyholderTargetOf(u: TargetColumns): WeightTarget | null {
  return u.targetWeightKeyholderKg === null
    ? null
    : { kg: u.targetWeightKeyholderKg, setAt: u.targetWeightKeyholderSetAt, source: "keyholder" };
}

/**
 * Das WIRKSAME Ziel: ihres, solange sie eines führt — sonst seines.
 *
 * Die Zuordnung „welche Spalte gehört wem" steht damit an einer Stelle statt an jeder Lesestelle
 * erneut. Alle vier Spalten sind `number | null` bzw. `Date | null`; eine Verwechslung sähe keine
 * Typprüfung.
 */
export function effectiveTarget(u: TargetColumns): WeightTarget | null {
  return keyholderTargetOf(u) ?? subTargetOf(u);
}

/**
 * Wie weit ein Wert neben dem Ziel liegen darf, ohne dass es als Verfehlung gilt — ein Kilo.
 *
 * Tagesgewicht schwankt um ein bis zwei Kilo. Ohne Toleranz meldete jede Mahlzeit einen Rückfall,
 * und die Meldung wäre nach einer Woche nichts mehr wert.
 */
const TARGET_TOLERANCE_KG = 1;

/** Worauf hingearbeitet wird. `hold` heisst: das Ziel ist der Stand von damals — halten. */
export type TargetDirection = "down" | "up" | "hold";

/**
 * Die Richtung aus dem Startgewicht. Ohne bekannten Start `hold`: wer nicht weiss, wo er losgelaufen
 * ist, hat keine Richtung — und eine geratene wäre schlimmer als keine, weil an ihr hängt, ob ein
 * Wert UNTER dem Ziel als Erfolg oder als Verfehlung gilt.
 */
function targetDirection(startKg: number | null, targetKg: number): TargetDirection {
  if (startKg === null || Math.abs(startKg - targetKg) < Number.EPSILON) return "hold";
  return startKg > targetKg ? "down" : "up";
}

/** Ist das Ziel erreicht? Beim Abnehmen zählt jeder Wert darunter mit — wer unter sein Ziel kommt,
 *  hat es nicht knapp verfehlt. Ohne Richtung entscheidet der Abstand in beide Richtungen. */
export function targetReached(currentKg: number, targetKg: number, direction: TargetDirection): boolean {
  if (direction === "down") return currentKg <= targetKg;
  if (direction === "up") return currentKg >= targetKg;
  return Math.abs(currentKg - targetKg) <= TARGET_TOLERANCE_KG;
}

export interface TargetProgress {
  targetKg: number;
  /** Das Gewicht, das beim Setzen des Ziels galt — `null`, wenn es damals keine Messung gab. */
  startKg: number | null;
  currentKg: number;
  direction: TargetDirection;
  /** Was noch fehlt, immer als positive Zahl. `0`, sobald das Ziel erreicht ist. */
  remainingKg: number;
  /** Anteil der Strecke, 0–100. `null` ohne Startwert oder wenn Start und Ziel gleich sind — dann
   *  gibt es keine Strecke, über die sich ein Anteil bilden liesse. */
  percent: number | null;
  reached: boolean;
}

/** Der Fortschritt zum Ziel — „von 100 auf 90, 38 % geschafft". */
export function targetProgress(params: { targetKg: number; startKg: number | null; currentKg: number }): TargetProgress {
  const { targetKg, startKg, currentKg } = params;
  const direction = targetDirection(startKg, targetKg);
  const reached = targetReached(currentKg, targetKg, direction);
  const span = startKg === null ? 0 : Math.abs(startKg - targetKg);
  // Vorzeichenbehaftet in Richtung des Ziels: beim Abnehmen zählt, was unter den Start geht, beim
  // Zunehmen das Gegenteil. Wer sich entfernt hat, bekommt eine negative Strecke — und unten 0 %.
  const done = startKg === null ? 0 : (targetKg < startKg ? startKg - currentKg : currentKg - startKg);
  const pct = coveragePct(done, span);
  return {
    targetKg,
    startKg,
    currentKg,
    direction,
    remainingKg: reached ? 0 : round1(Math.abs(currentKg - targetKg)),
    // `coveragePct` kappt oben (wer über sein Ziel hinausschiesst, steht bei 100) und liefert `null`,
    // wo es keine Strecke gibt; `Math.max` kappt unten (wer sich entfernt hat, steht bei 0). Der
    // ungekappte Abstand steht daneben in `remainingKg`.
    percent: pct === null ? null : Math.max(0, pct),
    reached,
  };
}

/**
 * Soll dieser Messwert der Keyholderin gemeldet werden — und als was?
 *
 * Zwei Ereignisse, jeweils **einmal je Übergang**: das Ziel ist erreicht, oder es ist nach einem
 * Erfolg wieder verloren. Gemeldet wird der Wechsel, nicht der Zustand — wer fünf Tage lang 200 g
 * über dem Ziel liegt, löst eine Meldung aus, nicht fünf.
 *
 * **Der Rückfall braucht die Toleranz, das Erreichen nicht.** Sonst wechselte ein Wert, der um das
 * Ziel herum pendelt, täglich zwischen beiden Meldungen; so muss er erst ein Kilo danebenliegen,
 * bevor der Erfolg als verloren gilt.
 *
 * **Unterhalb von BMI 18,5 wird nichts gemeldet.** Die App fordert nicht ein, was sie beim Setzen
 * selbst als bedenklich anzeigt. Das Ziel bleibt bestehen und sichtbar; es erzeugt nur keinen
 * Anstoss an die Keyholderin, tätig zu werden.
 */
export function targetEventToAnnounce(params: {
  currentKg: number;
  /** Der zuletzt gemessene Wert davor — `null` bei der ersten Messung. */
  previousKg: number | null;
  target: WeightTarget;
  startKg: number | null;
  heightCm: number | null;
}): "reached" | "relapsed" | null {
  const { currentKg, previousKg, target, startKg, heightCm } = params;
  if (isUnderweightTarget(target.kg, heightCm)) return null;

  const direction = targetDirection(startKg, target.kg);
  const nowReached = targetReached(currentKg, target.kg, direction);
  const wasReached = previousKg !== null && targetReached(previousKg, target.kg, direction);

  if (nowReached) return wasReached ? null : "reached";
  if (!wasReached) return null;
  // Verloren ist der Erfolg erst jenseits der Toleranz — knapp daneben ist noch kein Rückfall.
  const missBy = direction === "up" ? target.kg - currentKg : currentKg - target.kg;
  return missBy > TARGET_TOLERANCE_KG ? "relapsed" : null;
}

/** Stabile Codes dieses Moduls — die Service-Schicht reicht sie unverändert an die Route weiter. */
export const WEIGHT_PROBLEMS = {
  weightOutOfRange: "WEIGHT_OUT_OF_RANGE",
  heightOutOfRange: "HEIGHT_OUT_OF_RANGE",
} as const satisfies Record<string, ServiceErrorCode>;

/** Die Codes, die dieses Modul überhaupt liefern kann — enger als `ServiceErrorCode`, damit die
 *  Fehler-Tabelle des Dienstes sie vollständig abdecken MUSS: ein neuer Code hier ist dort ein
 *  Compile-Fehler statt eines stillen 500. */
export type WeightProblemCode = (typeof WEIGHT_PROBLEMS)[keyof typeof WEIGHT_PROBLEMS];

/** Liegt ein Gewicht im plausiblen Bereich? Fängt Zahlendreher und die falsch gelesene Waage.
 *  Gilt für Messwerte UND für Zielgewichte — ein Ziel von 4 kg ist kein Ziel, sondern ein Vertipper. */
export function weightProblem(kg: unknown): WeightProblemCode | null {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return WEIGHT_PROBLEMS.weightOutOfRange;
  return kg >= WEIGHT_KG_RANGE.min && kg <= WEIGHT_KG_RANGE.max ? null : WEIGHT_PROBLEMS.weightOutOfRange;
}

export function heightProblem(cm: unknown): WeightProblemCode | null {
  if (typeof cm !== "number" || !Number.isInteger(cm)) return WEIGHT_PROBLEMS.heightOutOfRange;
  return cm >= HEIGHT_CM_RANGE.min && cm <= HEIGHT_CM_RANGE.max ? null : WEIGHT_PROBLEMS.heightOutOfRange;
}

/**
 * Soll beim Setzen dieses Zielwerts gewarnt werden? Wahr, sobald das Ziel den Träger unter
 * {@link BMI_UNDERWEIGHT} führen würde.
 *
 * Sie warnt und sperrt nicht: bei kleiner Körpergrösse trifft sie auch Leute, bei denen sie nicht
 * passt. Seit die Nur-Lockern-Regel gestrichen ist, ist sie die einzige Bremse im Feature — und
 * genau deshalb gilt sie für BEIDE Seiten, nicht nur für die Keyholderin.
 */
export function isUnderweightTarget(targetKg: number, heightCm: number | null | undefined): boolean {
  const value = bmi(targetKg, heightCm);
  return value !== null && value < BMI_UNDERWEIGHT;
}

/**
 * Das Startgewicht aus einer bereits geladenen Reihe — die reine Zwillingsfunktion zu
 * `targetStartWeight` in `weightService.ts`.
 *
 * Wer die Messungen ohnehin in der Hand hält (Statistik-Karte, `weight_history`), soll dafür keine
 * zweite Abfrage stellen. Die Regel ist dieselbe: die letzte Messung bis zum Setz-Zeitpunkt, sonst
 * die erste danach. Der DB-Weg bleibt für die Aufrufer, die nur einen Ausschnitt geladen haben
 * (Dashboard-Kurzstand) oder gar keine Reihe (die Meldung nach dem Erfassen).
 *
 * `rows` MUSS aufsteigend nach `measuredAt` sortiert sein — so, wie beide Aufrufer sie ohnehin laden.
 */
export function startWeightIn(rows: readonly { measuredAt: Date; weightKg: number }[], setAt: Date | null): number | null {
  if (rows.length === 0) return null;
  if (setAt === null) return rows[0].weightKg;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].measuredAt.getTime() <= setAt.getTime()) return rows[i].weightKg;
  }
  return rows[0].weightKg;
}

// ── Tagesschlüssel ─────────────────────────────────────────────────────────────────────────────

/**
 * Der Kalendertag einer Messung in der Zeitzone des Trägers, als `YYYY-MM-DD`.
 *
 * **Warum nicht `tzDayKey` aus `utils.ts`.** Der liefert denselben Gedanken, aber einen bewusst
 * OPAKEN Schlüssel (`2026-7-22` — Monat nullbasiert, ohne führende Null), und seine Doku sagt
 * ausdrücklich: nur Gleichheit zählt, nie parsen. Für einen Wert, der im Speicher einer Anfrage
 * lebt, ist das richtig. Hier steht der Schlüssel aber **in einer Spalte**, und daran hängt der
 * `@@unique`, der „ein Wert pro Tag" durchsetzt:
 *
 * - Ändert jemand das opake Format (es ist als änderbar deklariert), passen neu berechnete
 *   Schlüssel nicht mehr zu den gespeicherten. Der Unique greift nicht mehr, und es entstehen
 *   still zwei Zeilen für denselben Tag — der Fehler, gegen den er gebaut ist.
 * - Ein nullbasierter Monat ohne Auffüllung sortiert nicht und lädt jeden späteren Leser dazu ein,
 *   `dayKey >= "2026-08-01"` zu schreiben und Unsinn zu bekommen.
 *
 * Deshalb hier ein eigenes, festgeschriebenes Format — mit `tzDateParts` als geteiltem Kern, damit
 * die Zeitzonen-Rechnung trotzdem nur an einer Stelle steht.
 */
export function weightDayKey(at: Date, tz: string): string {
  const { year, month, day } = tzDateParts(at, tz);
  // `tzDateParts` gibt den Monat NULLBASIERT zurück (0 = Januar) — daher das +1.
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` → Tageszahl seit Epoch. Nur zum Vergleichen und Abzählen von Tagen, nie zur
 *  Anzeige — der Bezugspunkt ist UTC, die Zeitzone steckt schon im Schlüssel. */
export function dayNumber(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Der Kalendertag `offset` Tage nach `dayKey` — Rechnung auf den Zahlen, nicht auf Instants.
 *  Damit trifft sie auch über einen Zeitumstellungs-Tag hinweg den nächsten Kalendertag. */
export function addWeightDays(dayKey: string, offset: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offset));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/** Mitternacht NACH `dayKey` in der Zone des Trägers — der Zeitpunkt, zu dem dieser Tag vorbei ist. */
export function endOfWeightDay(dayKey: string, tz: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return midnightOfLocalDate(y, m - 1, d + 1, tz);
}

// ── Grössen-Historie ───────────────────────────────────────────────────────────────────────────

/** Eine Zeile aus `HeightChange` — genau die Felder, die der Resolver liest.
 *
 *  **Der Resolver hat heute keinen Aufrufer** (jeder BMI rechnet mit der aktuellen Grösse). Er bleibt
 *  samt Tests stehen, weil er die vollständige, geprüfte Lese-Seite des Protokolls ist: wer die
 *  BMI-Kurve historisch rechnen lassen will, braucht ihn — nicht eine neue Herleitung derselben
 *  Regel. Das dazugehörige Prisma-Select ist dagegen entfallen: ein Abfrage-Bauteil ohne Abfrage
 *  ist kein Bauteil. */
export interface HeightChangeRow {
  heightCm: number;
  effectiveFrom: Date;
}

/**
 * `effectiveFrom` der ersten Zeile: die erste bekannte Grösse gilt „seit jeher".
 *
 * Vor ihr gibt es nichts — anders als bei den Reinigungsregeln, die einen Spalten-Default haben, ist
 * eine unbekannte Grösse kein Wert, der vorher galt. Ein späterer Zeitstempel behauptete dagegen,
 * davor habe eine ANDERE Grösse gegolten, und liesse das Protokoll mit einer Lücke beginnen.
 */
export const HEIGHT_EPOCH = new Date(0);

/** Die zum Zeitpunkt `at` geltende Körpergrösse — `null`, wenn davor keine bekannt war. */
export function heightAt(rows: HeightChangeRow[], at: Date): number | null {
  return effectiveAt(rows, at, null)?.heightCm ?? null;
}
