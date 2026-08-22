/**
 * Das Register der erlaubten Zahlen-Darstellungen: **welche Schreibweisen es gibt und wer sie
 * herstellen darf.**
 *
 * Die Gegenstücke sind `displayFormatSurfaces.ts` (was der Quelltext tatsächlich tut) und
 * `displayFormatRegistry.test.ts` (der Abgleich). Zusammen dieselbe Bauart wie beim
 * Funktionsmodell — Register plus Generator-taugliche Oberfläche plus Test —, und aus demselben
 * Grund: eine Aufräum-Aktion hält nicht, eine geprüfte Aussage schon.
 *
 * **Die Regel in einem Satz:** eine Dauer oder ein Prozentwert entsteht in `utils.ts` bzw.
 * `percent.ts` — nirgends sonst. Wer anderswo eine baut, bricht den Test und muss entweder die
 * vorhandene Funktion nehmen oder seine Stelle hier mit Begründung eintragen.
 */

/** Wofür eine Darstellung zuständig ist. Als Union, damit ein Tippfehler auffällt. */
export type DisplayKind = "duration" | "percent";

/**
 * Die Achse, an der sich seit dem 22.08.2026 alles entscheidet: **misst die Zahl eine Spanne oder
 * eine Summe?**
 *
 * `span` — ein durchgehender Zeitraum. Die Tage darin sind echte, aufeinanderfolgende Tage, also
 * darf die Darstellung sie nennen: eine Session dauerte `3T 2h 36min`.
 *
 * `total` — zusammengezählte Zeit. Ihre „Tage" hätten nie am Stück stattgefunden. „Diese Woche
 * 3T 2h 36min" war rechnerisch richtig und trotzdem falsch: es waren 74 Stunden über fünf
 * Kalendertage, und weil die Woche sieben Tage HAT, liest sich „3T" als „3 von 7". Summen zeigen
 * deshalb nur Stunden.
 *
 * Der Fehler war NICHT die Schreibweise, sondern die fehlende Unterscheidung — die erste Fassung
 * dieses Registers kannte nur eine Dauer-Familie und hat damit beide Bedeutungen in einen Topf
 * geworfen.
 */
export type DurationSense = "span" | "total";

export interface DisplayFormat {
  kind: DisplayKind;
  /** Nur bei `duration`: misst sie eine Spanne oder eine Summe? */
  sense?: DurationSense;
  /** Der Name, unter dem man sie aufruft. */
  name: string;
  /** `datei.ts:symbol` — der Sprung von hier in den Code. */
  anchor: string;
  /** Ein Satz: was sie beantwortet. */
  meaning: string;
  /** Bei `percent`: der Nenner. Bei `duration`: die Form der Ausgabe. */
  shape: string;
}

/**
 * Die Dauer-Familie. **Ein Format** (wortteilig, `2T 3h 14min`) in drei Zugängen, dazu die Uhr.
 *
 * Abgelöst wurden `formatHours`, `formatHoursHM`, `formatHoursHMCompact`, `formatMs`,
 * `formatDuration` und die eigene Zusammensetzung in `TimerDisplay` — acht Schreibweisen für
 * dieselbe Sache, mit drei Fehlern darin (Aufrunden an der Tagesgrenze, „–" für alles unter einer
 * Minute, verschluckte Minuten sobald Tage im Spiel waren).
 */
export const DURATION_FORMATS: readonly DisplayFormat[] = [
  {
    kind: "duration",
    sense: "span",
    name: "formatDurationMs",
    anchor: "utils.ts:formatDurationMs",
    meaning: "Eine abgeschlossene Dauer, aus Millisekunden.",
    shape: "2T 3h 14min · Null-Teile entfallen · <1min unterhalb einer Minute · 0min bei null",
  },
  {
    kind: "duration",
    sense: "span",
    name: "formatDurationHours",
    anchor: "utils.ts:formatDurationHours",
    meaning: "Dieselbe Dauer, aber die Eingabe liegt als Stunden vor (Ziele, Tages-/Wochensummen).",
    shape: "wie formatDurationMs · rundet die Eingabe auf die Millisekunde (Gleitkomma-Reste)",
  },
  {
    kind: "duration",
    sense: "span",
    name: "formatDurationBetween",
    anchor: "utils.ts:formatDurationBetween",
    meaning: "Dieselbe Dauer, aber die Eingabe sind zwei Zeitpunkte.",
    shape: "wie formatDurationMs",
  },
  {
    kind: "duration",
    sense: "span",
    name: "formatElapsedMs",
    anchor: "utils.ts:formatElapsedMs",
    meaning: "Eine LAUFENDE Dauer in Worten. Zeigt die Minute auch bei null, damit die letzte Stelle tickt.",
    shape: "2T 3h 14min · optional mit Sekunden",
  },
  {
    kind: "duration",
    sense: "span",
    name: "TimerDisplay (format=\"short\")",
    anchor: "TimerDisplay.tsx:formatShort",
    meaning: "Die laufende UHR. Feste Breite, Sekunden, Tage in Stunden gefaltet.",
    shape: "51:14:03 · bewusst kein Tages-Anteil",
  },
  {
    kind: "duration",
    sense: "total",
    name: "formatTotalMs",
    anchor: "utils.ts:formatTotalMs",
    meaning: "Eine SUMME zusammengezählter Zeit, aus Millisekunden. Nie Tage.",
    shape: "74h 36min · ab 1000 h ohne Minuten und mit Tausender-Trennung (7 446h) · ohne locale",
  },
  {
    kind: "duration",
    sense: "total",
    name: "formatTotalHours",
    anchor: "utils.ts:formatTotalHours",
    meaning: "Dieselbe Summe, Eingabe als Stunden — der Normalfall (Ziele, Perioden-Summen).",
    shape: "wie formatTotalMs · rundet die Eingabe auf die Millisekunde",
  },
] as const;

/** Die Prozent-Familie. Drei Nenner, drei Namen — der Grund steht in `percent.ts`. */
export const PERCENT_FORMATS: readonly DisplayFormat[] = [
  {
    kind: "percent",
    name: "goalPct",
    anchor: "percent.ts:goalPct",
    meaning: "Zielerfüllung — „Wie viel von dem, was verlangt ist, habe ich?\"",
    shape: "Nenner: das Soll · nicht geklemmt (130 % soll man sehen) · null ohne Ziel",
  },
  {
    kind: "percent",
    name: "coveragePct",
    anchor: "percent.ts:coveragePct",
    meaning: "Zeitanteil — „Welchen Teil des Tages war ich verschlossen?\"",
    shape: "Nenner: die verstrichene Spanne · auf 100 geklemmt",
  },
  {
    kind: "percent",
    name: "sharePct",
    anchor: "percent.ts:sharePct",
    meaning: "Verteilungsanteil — „Wie viel der Gesamtzeit entfällt auf dieses Gerät?\"",
    shape: "Nenner: eine Summe · die Anteile ergeben zusammen 100",
  },
  {
    kind: "percent",
    name: "ratioPct",
    anchor: "percent.ts:ratioPct",
    meaning: "Ein fertiges Verhältnis (0…1) in Prozent, ohne eigene Division.",
    shape: "keine Division · nur die Rundung",
  },
] as const;

/**
 * Eine Datei, in der eine Fundstelle des Scanners erlaubt ist — mit dem Grund.
 *
 * `contains` ist ein Ausschnitt der Zeile statt einer Zeilennummer: eine Nummer veraltet bei der
 * ersten eingefügten Zeile darüber, und eine veraltete Ausnahme lässt den Test entweder grundlos
 * fehlschlagen oder — schlimmer — eine neue Stelle durchrutschen.
 *
 * Ein leerer `contains` nimmt die GANZE Datei aus. Das ist nur dort vertretbar, wo eine zweite
 * Prüfung die Vollständigkeit sichert — bei `utils.ts` tut das der Export-Abgleich im Test
 * (jeder exportierte Formatierer muss in {@link DURATION_FORMATS} stehen).
 */
export interface DisplayFormatException {
  file: string;
  contains: string;
  reason: string;
}

/** Wer eine Dauer zusammensetzen darf, und wer nur so aussieht. */
export const DURATION_ASSEMBLY_EXCEPTIONS: readonly DisplayFormatException[] = [
  {
    file: "src/lib/utils.ts",
    contains: "",
    reason:
      "Hier IST der eine Ort, an dem eine Dauer entsteht — Zeile für Zeile auszunehmen wäre eine " +
      "Liste, die bei jeder Umformatierung bricht. Dass hier kein VIERTER Formatierer unbemerkt " +
      "dazukommt, sichert stattdessen der Export-Abgleich im Test.",
  },
  {
    file: "src/app/api/upload/route.ts",
    contains: "fromDatetimeLocal(",
    reason: "EXIF-Zeitstempel nach ISO — das „T\" ist der Datums-Trenner, keine Tages-Einheit.",
  },
  {
    file: "src/lib/serverLog.ts",
    contains: "s.replace(",
    reason: "Log-Kürzung `<5d>`: „d\" steht für Ziffern (digits), nicht für Tage.",
  },
  {
    file: "src/app/api/[transport]/route.ts",
    contains: "MCP_IMAGE_MAX_AGE_H",
    reason: "Englischer Fliesstext für die Keyholder-KI, eine feste Stundenzahl — keine Nutzer-Anzeige.",
  },
  {
    file: "src/lib/mcp/entryImage.ts",
    contains: "MCP_IMAGE_MAX_AGE_H",
    reason: "Dieselbe Fehlermeldung an die KI, derselbe Grund.",
  },
] as const;

/** Wer Prozent rechnen darf. */
export const PERCENT_MATH_EXCEPTIONS: readonly DisplayFormatException[] = [
  {
    file: "src/lib/percent.ts",
    contains: "asPct",
    reason: "Die eine Rundung, auf die alle vier Funktionen gehen.",
  },
] as const;
