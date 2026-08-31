import { mondayIndex } from "@/lib/utils";

/**
 * Wochentage als Bitmaske — der geteilte Baustein für „gilt an diesen Tagen".
 *
 * **Warum eigenständig und ohne Bezug auf ein Feature.** Die Wiege-Fenster sind der erste Nutzer;
 * dieselbe Frage stellen die Auto-Kontrollen (Schlaf-Fenster, festes Auslöse-Fenster) und die
 * Reinigungsfenster. Wer sie dort nachrüstet, nimmt dieses Modul und die `WeekdayPicker`-Komponente
 * daneben — statt die Arithmetik ein zweites Mal herzuleiten. Die REGELN der Fenster bleiben
 * getrennt (siehe `weightWindows.ts`): geteilt wird, was ein Wochentag ist, nicht was er auslöst.
 *
 * **Bitmaske statt Liste**, weil eine Auswahl aus sieben festen Dingen genau das ist: eine Zahl, die
 * sich in einem Ausdruck umschalten lässt ({@link toggleWeekday}) und in jede Form passt, in der die
 * Nutzer sie später ablegen — heute als Feld im JSON der Wiege-Fenster, morgen womöglich als
 * `Int`-Spalte neben den Auto-Kontroll-Zeiten. Ein Array bräuchte für beides eigene Prüfungen.
 *
 * Gezählt wird nach ISO 8601: **Montag = 1, Sonntag = 7** — dieselbe Zählung wie `Date.getUTCDay()`
 * sie NICHT hat (dort ist Sonntag 0). Der Unterschied ist die häufigste Fehlerquelle bei
 * Wochentagen, deshalb geht die Umrechnung nur über {@link isoWeekdayInTZ} — und die rechnet den
 * Wochentag nicht selbst aus, sondern verschiebt `mondayIndex` aus `utils.ts` um eins.
 */

/** Montag … Sonntag. Die Reihenfolge IST die Bit-Reihenfolge (Montag = Bit 0) und zugleich die
 *  Anzeige-Reihenfolge — eine Woche, die mit Sonntag beginnt, gibt es hier nicht. Die Werte sind
 *  reine Schlüssel: beschriftet wird über `buildWeekdayLabels` in der Sprache des Betrachters. */
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Alle sieben Tage — der Vorgabewert überall dort, wo niemand eine Auswahl getroffen hat. */
export const ALL_WEEKDAYS = 0b111_1111;

/** Das Bit eines ISO-Wochentags (1 = Montag … 7 = Sonntag). */
function weekdayBit(isoDay: number): number {
  return 1 << (isoDay - 1);
}

/** Gilt `mask` an diesem ISO-Wochentag? Eine leere Maske gilt an keinem Tag — das ist Absicht und
 *  heisst „nie", nicht „immer": wer alle Häkchen entfernt, hat die Regel abgeschaltet. */
export function weekdayMaskHas(mask: number, isoDay: number): boolean {
  return (mask & weekdayBit(isoDay)) !== 0;
}

/** Der ISO-Wochentag (1–7) eines Zeitpunkts in der Zone des Trägers — `mondayIndex` (Mo=0) plus eins.
 *  Die Intl-Abfrage und ihr „unbekanntes Kürzel → Montag" stehen dort, an EINER Stelle. */
export function isoWeekdayInTZ(at: Date, tz: string): number {
  return mondayIndex(at, tz) + 1;
}

/**
 * Der ISO-Wochentag `offset` Tage nach `isoDay` (1–7, wieder in 1–7).
 *
 * **Gerechnet, nicht datiert.** Wer stattdessen `at.getTime() + offset * 86_400_000` nimmt, addiert
 * 24 Stunden — und die sind an den Umstellungstagen kein Kalendertag; dicht an Mitternacht
 * überspringt diese Addition einen Wochentag oder wiederholt einen. Beide Fenster-Familien suchen
 * so ihr „nächstes Fenster", also steht der Schritt hier, wo auch die Zählung wohnt.
 */
export function isoDayPlus(isoDay: number, offset: number): number {
  return ((isoDay - 1 + offset) % 7) + 1;
}

/** Eine Maske aus ISO-Wochentagen. */
export function weekdayMaskOf(isoDays: readonly number[]): number {
  return isoDays.reduce((mask, day) => mask | weekdayBit(day), 0);
}

/** Maske mit einem umgeschalteten Tag — die Bedienung der Häkchen in einem Ausdruck. */
export function toggleWeekday(mask: number, isoDay: number): number {
  return mask ^ weekdayBit(isoDay);
}

/** Eine Maske aus fremder Hand (JSON, Formular, Alt-Bestand). Unbrauchbares fällt auf ALLE Tage
 *  zurück, nicht auf keinen: eine kaputte Zahl darf ein Fenster nicht stillschweigend abschalten. */
export function parseWeekdayMask(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return ALL_WEEKDAYS;
  const mask = raw & ALL_WEEKDAYS;
  return mask === 0 && raw !== 0 ? ALL_WEEKDAYS : mask;
}

/** Ist die Maske schreibbar? `0` ist es NICHT: ein Fenster ohne Tag wäre eine Regel, die nie gilt —
 *  wer das will, löscht das Fenster. */
export function weekdayMaskValid(raw: unknown): boolean {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= ALL_WEEKDAYS;
}

/**
 * Die Maske als Aufzählung ihrer Tage: `labels` liefert die Wörter, `allLabel` steht für alle sieben.
 *
 * Die Wörter kommen von aussen ({@link WEEKDAY_KEYS} sind Schlüssel, keine Sprache) — für Menschen
 * aus `buildWeekdayLabels` in der Sprache des Betrachters, für Maschinen aus den Schlüsseln selbst
 * ({@link weekdayMaskKeys}). Damit bleibt dieses Modul frei von i18n und die Zusammensetzung steht
 * trotzdem nur einmal da.
 *
 * `allLabel` ist kein Schönheitsfehler: „mon,tue,wed,thu,fri,sat,sun" füllt eine Zeile mit sieben
 * Wörtern, die nichts unterscheiden.
 */
export function weekdayMaskLabel(
  mask: number, labels: readonly string[], allLabel: string, sep = ", ",
): string {
  if (mask === ALL_WEEKDAYS) return allLabel;
  return labels.filter((_, i) => weekdayMaskHas(mask, i + 1)).join(sep);
}

/** Die Maske für MASCHINEN-Sichten: „mon,tue" bzw. `daily`. Bewusst NICHT übersetzt — Empfänger sind
 *  die MCP-Vorschau und die Erfolgsmeldung, und die sollen über Sprachumgebungen hinweg gleich
 *  lauten. Was ein Mensch liest, beschriftet die Oberfläche. */
export function weekdayMaskKeys(mask: number): string {
  return weekdayMaskLabel(mask, WEEKDAY_KEYS, "daily", ",");
}
