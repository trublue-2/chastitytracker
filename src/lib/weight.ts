import { effectiveAt, midnightOfLocalDate, round1, tzDateParts } from "@/lib/utils";
import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from "@/lib/constants";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/**
 * Rechenkern des Gewichtstrackings: Einheiten, BMI, Referenzbereiche, Zielkorridor, Grössen-Historie.
 *
 * Bewusst **importfrei bis auf `constants`/`utils`** (beide selbst client-tauglich), damit
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

/**
 * Referenz-BMI-Bereiche je Angabe.
 *
 * Die WHO-Einteilung ist geschlechtsunabhängig (18,5–25); die im deutschsprachigen Raum
 * gebräuchlichen Tabellen führen leicht verschobene Bereiche für Männer und Frauen. Genau dafür —
 * und NUR dafür — gibt es `User.referenceSex`: der BMI selbst rechnet ohne ihn.
 *
 * Der Bereich erscheint dort, wo der Sub sich Grenzen setzt, nicht im Statistik-Block. Eine
 * Einordnung ist beim Zielsetzen eine Hilfe; als Etikett im Alltag wäre sie ein Urteil.
 */
export const BMI_REFERENCE = {
  m: { min: 20, max: 25 },
  f: { min: 19, max: 24 },
  unspecified: { min: 18.5, max: 25 },
} as const;

export const REFERENCE_SEXES = ["m", "f"] as const;
export type ReferenceSex = (typeof REFERENCE_SEXES)[number];

export function isReferenceSex(v: unknown): v is ReferenceSex {
  return typeof v === "string" && (REFERENCE_SEXES as readonly string[]).includes(v);
}

/** Der Normbereich als GEWICHTS-Spanne für eine Grösse — die Form, in der er beim Zielsetzen hilft
 *  („für deine Grösse liegt der Normbereich zwischen 62 und 84 kg"). */
export function normalWeightRangeKg(
  heightCm: number | null | undefined,
  sex: ReferenceSex | null | undefined,
): { minKg: number; maxKg: number } | null {
  if (!heightCm || heightCm <= 0) return null;
  const ref = sex ? BMI_REFERENCE[sex] : BMI_REFERENCE.unspecified;
  const m2 = (heightCm / 100) ** 2;
  return { minKg: round1(ref.min * m2), maxKg: round1(ref.max * m2) };
}

// ── Zielkorridor ───────────────────────────────────────────────────────────────────────────────

/** Eine Grenze, die niemand gesetzt hat, ist `null` — nicht 0. */
export interface Corridor {
  minKg: number | null;
  maxKg: number | null;
}

/**
 * Der wirksame Korridor aus dem Wunsch des Subs und der Nachbesserung der Keyholderin.
 *
 * **Wirksam ist stets der WEITERE der beiden Werte.** Das ist die Regel „die Keyholderin darf nur
 * lockern" als Invariante statt als Prüfung: selbst wenn eine strengere Zahl auf irgendeinem Weg in
 * die Spalte käme (Alt-Daten, Roh-SQL, ein künftiger Schreibpfad), bliebe sie wirkungslos. Die
 * Prüfung in {@link keyholderCorridorProblem} sagt es der Keyholderin ins Gesicht; diese Funktion
 * sorgt dafür, dass es auch dann stimmt, wenn die Prüfung einmal umgangen wurde.
 */
export function effectiveCorridor(sub: Corridor, keyholder: Corridor): Corridor {
  return {
    minKg: pick(sub.minKg, keyholder.minKg, Math.min),
    maxKg: pick(sub.maxKg, keyholder.maxKg, Math.max),
  };
}

function pick(a: number | null, b: number | null, wider: (x: number, y: number) => number): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return wider(a, b);
}

/** Stabile Codes dieses Moduls — die Service-Schicht reicht sie unverändert an die Route weiter. */
export const WEIGHT_PROBLEMS = {
  weightOutOfRange: "WEIGHT_OUT_OF_RANGE",
  heightOutOfRange: "HEIGHT_OUT_OF_RANGE",
  corridorInverted: "WEIGHT_CORRIDOR_INVERTED",
  corridorNarrower: "WEIGHT_CORRIDOR_NARROWER",
} as const satisfies Record<string, ServiceErrorCode>;

/** Die Codes, die dieses Modul überhaupt liefern kann — enger als `ServiceErrorCode`, damit die
 *  Fehler-Tabelle des Dienstes sie vollständig abdecken MUSS: ein neuer Code hier ist dort ein
 *  Compile-Fehler statt eines stillen 500. */
export type WeightProblemCode = (typeof WEIGHT_PROBLEMS)[keyof typeof WEIGHT_PROBLEMS];

/** Liegt ein Gewicht im plausiblen Bereich? Fängt Zahlendreher und die falsch gelesene Waage. */
export function weightProblem(kg: unknown): WeightProblemCode | null {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return WEIGHT_PROBLEMS.weightOutOfRange;
  return kg >= WEIGHT_KG_RANGE.min && kg <= WEIGHT_KG_RANGE.max ? null : WEIGHT_PROBLEMS.weightOutOfRange;
}

export function heightProblem(cm: unknown): WeightProblemCode | null {
  if (typeof cm !== "number" || !Number.isInteger(cm)) return WEIGHT_PROBLEMS.heightOutOfRange;
  return cm >= HEIGHT_CM_RANGE.min && cm <= HEIGHT_CM_RANGE.max ? null : WEIGHT_PROBLEMS.heightOutOfRange;
}

/** Ein Korridor, dessen Untergrenze über der Obergrenze liegt, ist keiner. Beide Enden sind
 *  einzeln optional — nur eine Obergrenze („höchstens 84") ist der häufigste Fall überhaupt. */
export function corridorProblem(c: Corridor): WeightProblemCode | null {
  for (const v of [c.minKg, c.maxKg]) {
    if (v === null) continue;
    const problem = weightProblem(v);
    if (problem) return problem;
  }
  if (c.minKg !== null && c.maxKg !== null && c.minKg >= c.maxKg) return WEIGHT_PROBLEMS.corridorInverted;
  return null;
}

/**
 * Darf die Keyholderin diesen Korridor setzen? Sie darf ihn **nur weiten, nie verengen**.
 *
 * Der Grund steht in der Skizze des Nutzers: „ich wiege 90 und möchte 84 erreichen — dann kann die
 * KH keine 80 daraus machen, aber 87." Als Korridor formuliert braucht das keine Fallunterscheidung
 * über Ab- oder Zunehmen: 87 ist die weitere Obergrenze, 80 die engere.
 *
 * **Wo der Sub keine Grenze gesetzt hat, gibt es nichts zu weiten.** Eine Grenze dort einzuziehen
 * wäre der Schritt von unbegrenzt zu begrenzt — die grösstmögliche Verengung, nicht ihr Gegenteil.
 */
export function keyholderCorridorProblem(sub: Corridor, next: Corridor): WeightProblemCode | null {
  const own = corridorProblem(next);
  if (own) return own;
  if (next.minKg !== null && (sub.minKg === null || next.minKg > sub.minKg)) {
    return WEIGHT_PROBLEMS.corridorNarrower;
  }
  if (next.maxKg !== null && (sub.maxKg === null || next.maxKg < sub.maxKg)) {
    return WEIGHT_PROBLEMS.corridorNarrower;
  }
  return null;
}

/** Liegt das Gewicht ausserhalb des wirksamen Korridors — und auf welcher Seite? */
export function corridorBreach(kg: number, c: Corridor): "below" | "above" | null {
  if (c.minKg !== null && kg < c.minKg) return "below";
  if (c.maxKg !== null && kg > c.maxKg) return "above";
  return null;
}

/**
 * Soll dieser Messwert der Keyholderin gemeldet werden — und auf welcher Seite?
 *
 * **Einmal je Austritt.** Gemeldet wird der Übergang, nicht der Zustand: wer fünf Tage lang 200 g
 * über der Grenze liegt, löst eine Meldung aus, nicht fünf. Erst die Rückkehr in den Korridor macht
 * den nächsten Austritt wieder meldenswert. Ein Wechsel der SEITE zählt ebenfalls als neuer Austritt
 * — von unterhalb nach oberhalb ist eine andere Nachricht.
 *
 * **Unterhalb von BMI 18,5 wird nicht gemeldet.** Die App fordert nicht ein, was sie beim Setzen
 * selbst als bedenklich anzeigt. Die Grenze bleibt bestehen und im Diagramm sichtbar; sie erzeugt
 * nur keinen Anstoss an die Keyholderin, tätig zu werden.
 */
export function breachToAnnounce(params: {
  currentKg: number;
  /** Der zuletzt gemessene Wert davor — `null` bei der ersten Messung. */
  previousKg: number | null;
  corridor: Corridor;
  heightCm: number | null;
}): "below" | "above" | null {
  const breach = corridorBreach(params.currentKg, params.corridor);
  if (breach === null) return null;
  // Die überschrittene GRENZE, nicht das Gewicht: gemeldet wird ja, dass eine Vorgabe verfehlt ist.
  const bound = breach === "below" ? params.corridor.minKg : params.corridor.maxKg;
  if (bound !== null && isUnderweightTarget(bound, params.heightCm)) return null;
  const before = params.previousKg === null ? null : corridorBreach(params.previousKg, params.corridor);
  return before === breach ? null : breach;
}

/**
 * Soll beim Setzen dieses Zielwerts gewarnt werden? Wahr, sobald eine Grenze den Träger unter
 * {@link BMI_UNDERWEIGHT} führen würde.
 *
 * Die „nur-lockern"-Regel schützt vor der Keyholderin. Sie schützt nicht davor, dass der Sub sich
 * selbst eine Zahl setzt, die anschliessend in einem Machtverhältnis von aussen eingefordert wird —
 * dafür ist diese Schwelle da. Sie warnt und sperrt nicht: bei kleiner Körpergrösse trifft sie auch
 * Leute, bei denen sie nicht passt.
 */
export function isUnderweightTarget(targetKg: number, heightCm: number | null | undefined): boolean {
  const value = bmi(targetKg, heightCm);
  return value !== null && value < BMI_UNDERWEIGHT;
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

/** Eine Zeile aus `HeightChange` — genau die Felder, die der Resolver liest. */
export interface HeightChangeRow {
  heightCm: number;
  effectiveFrom: Date;
}

/** Prisma-Select genau dieser Felder, damit Abfrage und Zeilentyp nicht getrennt veralten
 *  (Vorbild: `CLEANING_RULE_CHANGE_SELECT`). Kein `orderBy` — `effectiveAt` sortiert selbst. */
export const HEIGHT_CHANGE_SELECT = { heightCm: true, effectiveFrom: true } as const;

/**
 * `effectiveFrom` der ersten Zeile: die erste bekannte Grösse gilt „seit jeher".
 *
 * Vor ihr gibt es nichts — anders als bei den Reinigungsregeln, die einen Spalten-Default haben, ist
 * eine unbekannte Grösse kein Wert, der vorher galt. Epoch lässt damit keine Lücke, in die eine
 * frühe Messung fallen und ohne BMI dastehen könnte.
 */
export const HEIGHT_EPOCH = new Date(0);

/** Die zum Zeitpunkt `at` geltende Körpergrösse — `null`, wenn davor keine bekannt war. */
export function heightAt(rows: HeightChangeRow[], at: Date): number | null {
  return effectiveAt(rows, at, null)?.heightCm ?? null;
}
