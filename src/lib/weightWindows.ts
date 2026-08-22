import { APP_TZ } from "@/lib/utils";
import { WEIGHING_WINDOWS_MAX } from "@/lib/constants";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/**
 * Die täglichen Wiege-Fenster: „zwischen 6 und 8 Uhr wiegen".
 *
 * **Warum das nicht die Reinigungsfenster mitbenutzt.** Von aussen sehen beide gleich aus — eine
 * Liste aus `{start,end}` in der Wanduhrzeit des Subs. Fachlich sind sie verschieden:
 *
 * | | Reinigungsfenster | Wiege-Fenster |
 * |---|---|---|
 * | regelt | **Erlaubnis** — darf das Gerät jetzt geöffnet werden | **Gültigkeit** — ist die Messung vergleichbar |
 * | Verletzung | Vergehen (`cleaning_limit`) | der Wert wird markiert, nicht geahndet |
 * | daran hängt | Sperrzeit, Box-Kommando, Wiederverschluss-Kontrolle, Strafbuch | nur die eigene Auswertung |
 *
 * Am Reinigungsfenster hängen Hardware, eine automatische Kontrolle und eine Vergehensart mit
 * eigener Stichtags-Historie. Ein gemeinsamer Baustein würde diese Wege an ein Feature koppeln, das
 * mit ihnen nichts zu tun hat, und jede künftige Änderung auf der Wiege-Seite müsste beweisen, dass
 * sie die Reinigung nicht bewegt. Der Preis ist diese Datei — rund dreissig Zeilen ähnlicher
 * Zeitarithmetik.
 *
 * **Für `/simplify`: die Doppelung ist gesehen und gewollt.** Wer sie mit `reinigungService.ts`
 * zusammenlegt, ändert die Reinigungslogik — eine eigene Entscheidung, keine Aufräumarbeit nebenbei
 * (siehe docs/gewicht-konzept.md, Abschnitt 4.1).
 *
 * Der fachliche Grund für Fenster überhaupt: Gewicht schwankt über den Tag um ein bis zwei Kilo.
 * Morgens nüchtern und abends nach dem Essen gemessene Werte sind nicht dieselbe Messreihe — ohne
 * Fenster misst die Kurve die Tageszeit mit.
 */

export interface WeighingWindow {
  start: string;
  end: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fenster über Mitternacht gibt es hier bewusst nicht: `start < end`. Wer um 23 Uhr beginnt und um
 *  1 Uhr endet, wiegt nicht mehr nüchtern zur gleichen Tageszeit — der Fall wäre eine Einladung,
 *  die Messreihe unbrauchbar zu machen. */
function shape(w: unknown): WeighingWindow | null {
  const start = (w as { start?: unknown })?.start;
  const end = (w as { end?: unknown })?.end;
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!HHMM.test(start) || !HHMM.test(end) || start >= end) return null;
  return { start, end };
}

/** Parst die Liste aus `User.weighingWindows` (JSON-String ODER Array). **Tolerant:** Murks wird
 *  still verworfen. Das ist der LESE-Pfad — Bestand darf nicht daran scheitern, dass er einmal
 *  schief in die Spalte kam. Die strengere Schreib-Regel steht in {@link weighingWindowsProblem}. */
export function parseWeighingWindows(raw: unknown): WeighingWindow[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: WeighingWindow[] = [];
  for (const w of arr) {
    const parsed = shape(w);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Die SCHREIB-Regel der ganzen Liste: stabiler Fehler-Code, `null` heisst gültig.
 *
 * Der Lese-Pfad verwirft Murks still; für einen Schreiber wäre genau das die Falle — „08:00–06:00"
 * käme als `ok` zurück und hätte in Wahrheit ein Fenster gelöscht.
 */
export function weighingWindowsProblem(raw: unknown): ServiceErrorCode | null {
  if (!Array.isArray(raw)) return "invalidTime";
  if (raw.length > WEIGHING_WINDOWS_MAX) return "WEIGHING_WINDOWS_TOO_MANY";
  for (const w of raw) {
    const start = (w as { start?: unknown })?.start;
    const end = (w as { end?: unknown })?.end;
    if (typeof start !== "string" || !HHMM.test(start)) return "invalidTime";
    if (typeof end !== "string" || !HHMM.test(end)) return "invalidTime";
    if (start >= end) return "timeRangeInvalid";
  }
  return null;
}

/** Ein Fenster als eine Zeile („06:00-08:00") — für Meldungen und Feld-Diffs. */
export function formatWeighingWindow(w: WeighingWindow): string {
  return `${w.start}-${w.end}`;
}

/** „HH:MM" der Uhrzeit in `tz` — 24h, fest mit ":" für den lexikalischen Vergleich. */
function hhmmInTZ(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(at);
}

/**
 * Lag `at` in einem Wiege-Fenster? **Keine Fenster gesetzt = keine Fensterpflicht** → immer wahr.
 *
 * Das ist die Vorgabe: wer keine Zeitfenster will, bekommt das vollständige Feature ohne sie. Die
 * Alternative („ohne Fenster zählt nichts") wäre konsequent gedacht und in der Wirkung absurd — das
 * Feature bliebe unbenutzbar, bis jemand ein Fenster setzt.
 *
 * `tz` ist die Zone des SUBS: die Fenster sind seine Wanduhrzeit, nicht die des Betrachters.
 */
export function inWeighingWindow(raw: unknown, at: Date, tz = APP_TZ): boolean {
  const windows = parseWeighingWindows(raw);
  if (windows.length === 0) return true;
  const hhmm = hhmmInTZ(at, tz);
  return windows.some((w) => w.start <= hhmm && hhmm < w.end);
}

/** Das Fenster, in dem `at` liegt — sonst null. Für die Anzeige „läuft noch bis 08:00". */
export function activeWeighingWindow(raw: unknown, at: Date, tz = APP_TZ): WeighingWindow | null {
  const hhmm = hhmmInTZ(at, tz);
  return parseWeighingWindows(raw).find((w) => w.start <= hhmm && hhmm < w.end) ?? null;
}

/**
 * Das nächste Fenster, das nach `at` BEGINNT — sonst das früheste des Tages (dann liegt es morgen).
 * `null`, wenn keine Fenster gesetzt sind (= keine Fensterpflicht, es gibt kein „wieder").
 *
 * Läuft `at` gerade IN einem Fenster, liefert das trotzdem das darauffolgende: „läuft gerade"
 * beantwortet {@link activeWeighingWindow}, hier geht es um „wann wieder".
 */
export function nextWeighingWindow(raw: unknown, at: Date, tz = APP_TZ): WeighingWindow | null {
  const windows = parseWeighingWindows(raw);
  if (windows.length === 0) return null;
  const hhmm = hhmmInTZ(at, tz);
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.find((w) => w.start > hhmm) ?? sorted[0];
}

/**
 * Der Fenster-Hinweis über dem Erfassungs-Formular, aus den beiden Zeit-Angaben des Servers.
 *
 * Hier und nicht in den Seiten, weil ihn BEIDE brauchen — die des Trägers und die der Keyholderin —
 * und ein zweiter Aufbau desselben Satzes irgendwann auseinanderliefe. `null` heisst: keine Fenster
 * gesetzt, also nichts zu sagen.
 */
export function weighingWindowHint(
  props: { windowActiveUntil: string | null; windowNextFrom: string | null },
  t: (key: string, values?: Record<string, string>) => string,
): string | null {
  if (props.windowActiveUntil) return t("windowOpenUntil", { time: props.windowActiveUntil });
  if (props.windowNextFrom) return t("windowNextFrom", { time: props.windowNextFrom });
  return null;
}
