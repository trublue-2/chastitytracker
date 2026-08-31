import { APP_TZ, hhmmFromMinutes, hhmmInTZ, hhmmToMinutes } from "@/lib/utils";
import { HHMM, WEIGHING_WINDOWS_MAX, WEIGHING_WINDOW_DURATION_RANGE } from "@/lib/constants";
import { isoDayPlus, isoWeekdayInTZ, parseWeekdayMask, weekdayMaskHas, weekdayMaskValid } from "@/lib/weekdays";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import { listProblem, parseJsonList, type ListProblem } from "@/lib/jsonList";

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
 * **Für `/simplify`: die Doppelung ist gesehen und gewollt.** Wer sie mit `cleaningService.ts`
 * zusammenlegt, ändert die Reinigungslogik — eine eigene Entscheidung, keine Aufräumarbeit nebenbei
 * (siehe docs/gewicht-konzept.md, Abschnitt 4.1).
 *
 * Der fachliche Grund für Fenster überhaupt: Gewicht schwankt über den Tag um ein bis zwei Kilo.
 * Morgens nüchtern und abends nach dem Essen gemessene Werte sind nicht dieselbe Messreihe — ohne
 * Fenster misst die Kurve die Tageszeit mit.
 */

/**
 * Ein Fenster: ab wann, wie lange, an welchen Tagen — und ob daran erinnert wird.
 *
 * **Startzeit plus Dauer statt Anfang und Ende.** So steht es auf dem Zettel des Nutzers („ab 5:00,
 * ca. 3 h"), und so denkt auch, wer es einstellt: die Dauer ist die Grosszügigkeit, die er dem
 * Träger einräumt. Zwei Uhrzeiten zwingen ihn, sie jedes Mal selbst auszurechnen.
 */
export interface WeighingWindow {
  start: string;
  durationMin: number;
  /** Bitmaske der Wochentage (`weekdays.ts`) — an welchen Tagen dieses Fenster überhaupt gilt. */
  days: number;
  /** Erinnert die App zum Fensterbeginn, wenn an diesem Tag noch kein Wert steht? */
  remind: boolean;
}

/** Das Ende eines Fensters als „HH:MM" — abgeleitet, nie gespeichert. */
export function weighingWindowEnd(w: WeighingWindow): string {
  return hhmmFromMinutes(hhmmToMinutes(w.start) + w.durationMin);
}

/**
 * Fenster über Mitternacht gibt es hier bewusst nicht: Start plus Dauer muss im selben Tag bleiben.
 * Wer um 23 Uhr beginnt und um 1 Uhr endet, wiegt nicht mehr nüchtern zur gleichen Tageszeit — der
 * Fall wäre eine Einladung, die Messreihe unbrauchbar zu machen.
 *
 * **Alt-Fenster `{start, end}` werden mitgelesen** und in Start + Dauer übersetzt: sie stehen als
 * JSON in der Spalte, und ein Lese-Pfad, der sie verwirft, löschte beim ersten Speichern still die
 * Einstellung des Nutzers.
 */
function shape(w: unknown): WeighingWindow | null {
  const raw = w as { start?: unknown; end?: unknown; durationMin?: unknown; days?: unknown; remind?: unknown };
  if (typeof raw?.start !== "string" || !HHMM.test(raw.start)) return null;

  let durationMin: number;
  if (typeof raw.durationMin === "number" && Number.isFinite(raw.durationMin)) {
    durationMin = Math.round(raw.durationMin);
  } else if (typeof raw.end === "string" && HHMM.test(raw.end)) {
    durationMin = hhmmToMinutes(raw.end) - hhmmToMinutes(raw.start);
  } else {
    return null;
  }
  if (durationMin < 1 || hhmmToMinutes(raw.start) + durationMin > 24 * 60) return null;

  return {
    start: raw.start,
    durationMin,
    days: parseWeekdayMask(raw.days),
    // Alt-Fenster kannten keine Erinnerung — und ein Update darf niemandem ungefragt Nachrichten
    // einschalten. Also aus, bis jemand das Häkchen setzt.
    remind: raw.remind === true,
  };
}

/** Parst die Liste aus `User.weighingWindows` (JSON-String ODER Array). **Tolerant:** Murks wird
 *  still verworfen. Das ist der LESE-Pfad — Bestand darf nicht daran scheitern, dass er einmal
 *  schief in die Spalte kam. Die strengere Schreib-Regel steht in {@link weighingWindowsProblem}. */
export function parseWeighingWindows(raw: unknown): WeighingWindow[] {
  return parseJsonList(raw, shape);
}

/**
 * Die SCHREIB-Regel der ganzen Liste: stabiler Fehler-Code samt Position, `null` heisst gültig.
 *
 * Der Lese-Pfad verwirft Murks still; für einen Schreiber wäre genau das die Falle — ein Fenster
 * über Mitternacht käme als `ok` zurück und wäre in Wahrheit gelöscht.
 *
 * Der `index` sagt, WELCHES Fenster stört (Vorbild `cleaningWindowListProblem`). Ohne ihn bekommt
 * eine Agentin, die fünf Fenster auf einmal setzt, ein blosses „Invalid time" und muss raten.
 */
export function weighingWindowsProblem(raw: unknown): ListProblem | null {
  return listProblem(
    raw,
    { max: WEIGHING_WINDOWS_MAX, notAListCode: "invalidTime", tooManyCode: "WEIGHING_WINDOWS_TOO_MANY" },
    weighingWindowProblem,
  );
}

/** Die SCHREIB-Regel EINES Fensters. */
function weighingWindowProblem(w: unknown): ServiceErrorCode | null {
  const { start, durationMin, days } = (w ?? {}) as Record<string, unknown>;
  if (typeof start !== "string" || !HHMM.test(start)) return "invalidTime";
  if (typeof durationMin !== "number" || !Number.isInteger(durationMin)) return "invalidTime";
  if (durationMin < WEIGHING_WINDOW_DURATION_RANGE.min || durationMin > WEIGHING_WINDOW_DURATION_RANGE.max) {
    return "timeRangeInvalid";
  }
  // Über Mitternacht hinaus gibt es kein Fenster — der Schreiber erfährt den Grund, statt dass der
  // Lese-Pfad es später still verwirft.
  if (hhmmToMinutes(start) + durationMin > 24 * 60) return "timeRangeInvalid";
  // `days` darf fehlen (dann alle Tage), aber nicht falsch sein: eine Null-Maske wäre ein Fenster,
  // das nie gilt, und sähe in der Liste trotzdem nach einer Regel aus.
  if (days !== undefined && !weekdayMaskValid(days)) return "invalidTime";
  return null;
}

/** Gilt dieses Fenster an dem Kalendertag, in den `at` fällt? */
function appliesOn(w: WeighingWindow, at: Date, tz: string): boolean {
  return weekdayMaskHas(w.days, isoWeekdayInTZ(at, tz));
}

/** Läuft `at` gerade in diesem Fenster? Tag und Uhrzeit müssen beide passen. */
function covers(w: WeighingWindow, at: Date, tz: string): boolean {
  if (!appliesOn(w, at, tz)) return false;
  const now = hhmmToMinutes(hhmmInTZ(at, tz));
  const from = hhmmToMinutes(w.start);
  return from <= now && now < from + w.durationMin;
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
  return windows.some((w) => covers(w, at, tz));
}

/** Das Fenster, in dem `at` liegt — sonst null. Für die Anzeige „läuft noch bis 08:00". */
export function activeWeighingWindow(raw: unknown, at: Date, tz = APP_TZ): WeighingWindow | null {
  return parseWeighingWindows(raw).find((w) => covers(w, at, tz)) ?? null;
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

  // Erst heute, dann die kommenden Tage der Reihe nach. Ein blosses „sonst das früheste der Liste"
  // wäre seit den Wochentagen falsch: wer freitagabends auf ein Werktags-Fenster schaut, bekäme
  // „wieder ab 06:00" — und das gilt erst am Montag. Sieben Tage reichen, mehr hat eine Woche nicht.
  //
  // Der Schritt geht über {@link isoDayPlus}, nicht über `at + offset * 24h`: 24 Stunden sind an den
  // Umstellungstagen kein Kalendertag, und dicht an Mitternacht übersprang die Addition einen Tag.
  const heute = isoWeekdayInTZ(at, tz);
  const treffer = sorted.find((w) => w.start > hhmm && weekdayMaskHas(w.days, heute));
  if (treffer) return treffer;
  for (let offset = 1; offset <= 7; offset++) {
    const tag = isoDayPlus(heute, offset);
    const naechster = sorted.find((w) => weekdayMaskHas(w.days, tag));
    if (naechster) return naechster;
  }
  return null;
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
