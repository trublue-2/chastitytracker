/** Einheiten-Kürzel für „Tage" nach Locale. Prefix-Vergleich, damit auch regionale Tags
 *  (`"en-US"`, `"en-GB"`) als Englisch zählen — `"de-CH"` bleibt bei "T". */
function dayUnit(locale: string): string {
  return locale.startsWith("en") ? "d" : "T";
}

/** Was `formatDurationMs` für eine Dauer unter einer Minute schreibt. Bewusst nicht „0min":
 *  eine 45-Sekunden-Session IST etwas, und ein „0min" (oder das frühere „–") liest sich wie
 *  nichts.
 *
 *  ACHTUNG beim Einbetten in HTML: der Wert beginnt mit „<" und ist damit ein angefangenes Tag.
 *  Jede Mail-Vorlage muss die Dauer durch `escHtml` schicken. */
const SUB_MINUTE_LABEL = "<1min";

/**
 * **Die eine Darstellung einer abgeschlossenen Dauer** — „2T 3h 14min" (Etappe A, 22.08.2026).
 *
 * Sie hat fünf Vorgänger abgelöst (`formatHours`, `formatHoursHM`, `formatHoursHMCompact`,
 * `formatMs`, `formatDuration`), die dieselbe Dauer unterschiedlich schrieben — und dabei drei
 * Fehler mitbrachten, die hier bewusst NICHT wiederkehren:
 *
 * - **Nichts wird aufgerundet.** `formatHours` machte aus 23 h 59 min ein „24h" — eine Minute vor
 *   dem Tag, aber zu lesen wie ein voller. Betroffen waren Tragekalender und Monatsübersicht,
 *   also genau die Stellen, an denen jemand nachzählt, ob ein Tagesziel erreicht wurde.
 * - **Unter einer Minute verschwindet nichts.** `formatMs` schrieb dafür „–", also wie „kein Wert".
 * - **Minuten fallen nicht weg, nur weil Tage im Spiel sind.** `formatMs` zeigte für 5T 0h 30min
 *   und 5T 0h 00min dasselbe „5T".
 *
 * Null-Teile entfallen (`24 h` → „1T", `5T 0h 30min` → „5T 30min"); ist alles null, bleibt „0min".
 *
 * NICHT für laufende Anzeigen — dafür {@link formatElapsedMs} (zeigt die Minute auch bei 0, damit
 * die letzte Stelle tickt) bzw. die Uhr in `TimerDisplay` (`h:mm:ss`, feste Breite).
 *
 * `locale` ist PFLICHT, kein Vorgabewert. Ein `= "de"` wäre bequem und genau die Falle, in die
 * diese Umstellung prompt gelaufen ist: die drei Kacheln des Dashboards riefen vorher einen
 * Formatierer OHNE Einheiten auf, brauchten also nie ein Locale — nach dem Wechsel hätten sie
 * einem englischen Nutzer stillschweigend „2T 3h" gezeigt. Pflicht heisst: der Compiler fragt.
 */
export function formatDurationMs(ms: number, locale: string): string {
  if (ms < 0) return "–";
  if (ms > 0 && ms < 60_000) return SUB_MINUTE_LABEL;

  const { days, hours, minutes } = decomposeMs(ms);
  const d = dayUnit(locale);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);

  return parts.join(" ");
}

/**
 * {@link formatDurationMs} für eine Dauer, die als STUNDEN vorliegt (Ziele, Tages-/Wochensummen).
 *
 * `Math.round` auf die Millisekunde ist kein Schönheitsrunden, sondern nötig: Stunden kommen hier
 * als Gleitkommazahl an (`calculateWearingHoursByRange`, Stundenziele), und `2 + 3/60` mal
 * 3 600 000 ergibt 7 379 999.999… — abgeschnitten also „2h 2min" für zwei Stunden und drei
 * Minuten. Gerundet wird die Millisekunde, nicht die Minute; die Abschneide-Regel von
 * `formatDurationMs` bleibt damit unangetastet.
 */
export function formatDurationHours(h: number, locale: string): string {
  return formatDurationMs(Math.round(h * 3_600_000), locale);
}

/** {@link formatDurationMs} für zwei Zeitpunkte. */
export function formatDurationBetween(start: Date, end: Date, locale: string): string {
  return formatDurationMs(end.getTime() - start.getTime(), locale);
}

/** Ab dieser Stundenzahl schreibt {@link formatTotalMs} keine Minuten mehr. */
const TOTAL_COARSE_FROM_HOURS = 1000;

/**
 * **Eine SUMME zusammengezählter Zeit** — „74h 36min", „7 446h". Niemals Tage.
 *
 * Der Unterschied zu {@link formatDurationMs} ist keine Formatfrage, sondern eine Bedeutungsfrage,
 * und er ist im Betrieb aufgefallen: „Diese Woche 3T 2h 36min" war rechnerisch richtig und trotzdem
 * eine Falschaussage. Es gab keine drei Tage — es waren 74 Stunden, verteilt über fünf Kalendertage.
 * Und weil eine Woche sieben Tage HAT, liest sich „3T" unweigerlich als „3 von 7".
 *
 * Eine Spanne darf Tage nennen, weil ihre Tage echte, aufeinanderfolgende Tage sind. Eine Summe
 * darf es nicht: ihre „Tage" sind 24-Stunden-Portionen, die nie am Stück stattgefunden haben.
 *
 * Der zweite Grund steht bei den Zielen: die Keyholderin trägt **130 Stunden pro Woche** ein. Das
 * als „5T 10h" zurückzuspielen ist eine Umrechnung, um die niemand gebeten hat.
 *
 * **Ab {@link TOTAL_COARSE_FROM_HOURS} Stunden fallen die Minuten weg** und Tausender werden mit
 * einem geschützten Leerzeichen gruppiert (`7 446h`). Das ist NICHT derselbe Fehler wie beim
 * abgelösten `formatMs`, das Minuten schon ab 24 h verschluckte und damit „5T 30min" und „5T"
 * ununterscheidbar machte: dort waren die Minuten bis zu ein Drittel des Werts, hier sind sie
 * unter einem Promille.
 *
 * **Ohne `locale`, und das ist kein Versehen:** ohne Tages-Einheit gibt es nichts zu übersetzen —
 * „h" und „min" sind in beiden Sprachen gleich, und der Tausender-Trenner ist bewusst
 * sprachunabhängig gewählt (die Aufrufer reichen teils `"de"`, teils `"de-CH"` herein, was mit
 * `Intl.NumberFormat` zu zwei verschiedenen Trennern für dieselbe Zahl führen würde). Wer hier je eine
 * Tages-Einheit einführt, muss `locale` nachziehen — dann aber an allen Aufrufern.
 */
export function formatTotalMs(ms: number): string {
  if (ms < 0) return "–";
  if (ms > 0 && ms < 60_000) return SUB_MINUTE_LABEL;

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= TOTAL_COARSE_FROM_HOURS) {
    // U+00A0 statt eines normalen Leerzeichens: die Zahl darf nicht umbrechen.
    return `${hours.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}h`;
  }
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${minutes}min`;
}

/**
 * {@link formatTotalMs} für eine Summe, die als STUNDEN vorliegt — der Normalfall, weil Ziele und
 * Perioden-Summen als Stunden gerechnet werden.
 *
 * `Math.round` auf die Millisekunde aus demselben Grund wie bei {@link formatDurationHours}:
 * `(2 + 3/60) * 3_600_000` ergibt 7 379 999.999… und ergäbe abgeschnitten „2h 2min".
 */
export function formatTotalHours(h: number): string {
  return formatTotalMs(Math.round(h * 3_600_000));
}

/** Zerlegt eine Dauer in Tage/Stunden/Minuten/Sekunden (jeweils abgerundet, Rest-basiert).
 *  Nur die ZERLEGUNG ist geteilt — die Zusammensetzung bleibt je Formatter eigen, weil sich
 *  Einheiten ("m" vs "min"), Null-Behandlung ("–") und Minuten-Unterdrückung unterscheiden. */
export function decomposeMs(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    seconds: totalSeconds % 60,
  };
}

/**
 * Die LAUFENDE Fassung von {@link formatDurationMs}: gleiche Einheiten, aber die Minute steht
 * immer da („1T 0min" statt „1T"). Das ist der ganze Unterschied und er ist Absicht — eine
 * tickende Anzeige, deren letzte Stelle zwischendurch verschwindet, springt in der Breite und
 * sieht aus wie stehengeblieben.
 */
export function formatElapsedMs(ms: number, locale: string, showSeconds = false): string {
  const { days, hours, minutes, seconds } = decomposeMs(Math.max(0, ms));
  const d = dayUnit(locale);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  if (showSeconds) parts.push(`${String(seconds).padStart(2, "0")}s`);
  return parts.join(" ");
}
