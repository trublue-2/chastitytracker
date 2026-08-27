"use client";

import { useLocale, useTranslations } from "next-intl";
import useTick from "@/app/hooks/useTick";
import { formatElapsedMs } from "@/lib/utils";

type TimerMode = "countup" | "countdown";
type TimerFormat = "long" | "short";

interface TimerDisplayProps {
  targetDate: Date | string;
  mode?: TimerMode;
  format?: TimerFormat;
  /** Ab wann die verbleibende Zeit Aufmerksamkeit bekommt (ms). Nur für `countdown`. */
  warnAtMs?: number;
  /** Ab wann sie dringlich wird (ms). Nur für `countdown`. */
  criticalAtMs?: number;
  className?: string;
  /** Den `sr-only`-Vorspann („Verbleibend"/„Vergangen") weglassen, wenn der Aufrufer die Richtung
   *  bereits im sichtbaren Text sagt. Ohne das las ein Screenreader „Kontrolle bis Verbleibend:
   *  1h 59min" — zweimal dieselbe Auskunft in einem Satz. Vorgabe: der Vorspann steht, denn ohne
   *  ihn sind Hoch- und Herunterzählen akustisch nicht zu unterscheiden. */
  srPrefix?: boolean;
  onExpire?: () => void;
}

/** Bewusst NICHT über `decomposeMs`: die Uhr-Darstellung `h:mm:ss` faltet Tage in die Stunden
 *  (49h statt „2T 1h"), `decomposeMs` trennt sie ab. Ein Umbau änderte jede Anzeige über 24 h. */
function formatShort(totalMs: number): string {
  const totalSeconds = Math.floor(Math.abs(totalMs) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Die Farbe eines Countdowns nach der VERBLEIBENDEN ZEIT, nicht nach einem Anteil.
 *
 * Vorher rechnete die Komponente einen Anteil aus — und zwar `diffMs / (|diffMs| + diffMs)`, also
 * mathematisch **immer exakt 0.5**. Die Farbe stand damit konstant auf einer Stufe und eskalierte
 * nie: eine 15-Minuten-Frist war bei 14:59 dieselbe Farbe wie bei 00:05, und die Warnfarbe kam
 * erst, wenn die Frist schon abgelaufen war. Der Fehler war jahrelang unsichtbar, weil die einzige
 * Aufrufstelle mit `!text-white` darüberschrieb.
 *
 * Ein Anteil bräuchte die GESAMTDAUER des Fensters, und die kennt diese Komponente nicht — sie
 * bekommt nur ein Ziel. Absolute Schwellen beantworten dieselbe Frage ehrlich: „noch fünf Minuten"
 * ist dringend, egal ob das Fenster eine Stunde oder einen Tag lang war.
 */
function phaseColor(remainingMs: number, warnAtMs: number, criticalAtMs: number): string {
  if (remainingMs <= criticalAtMs) return "text-warn";
  if (remainingMs <= warnAtMs) return "text-inspect";
  return "";
}

export default function TimerDisplay({
  targetDate,
  mode = "countup",
  format = "long",
  warnAtMs = 30 * 60_000,
  criticalAtMs = 5 * 60_000,
  className = "",
  srPrefix = true,
  onExpire,
}: TimerDisplayProps) {
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  const locale = useLocale();
  const tc = useTranslations("common");
  // Der Takt folgt der ANZEIGE: `format="long"` zeigt Minuten (`formatElapsedMs` ohne Sekunden),
  // ein Sekundentakt erzeugte dort 59 von 60 Renders mit zeichengleicher Ausgabe. Der Preis war
  // nicht Rechenzeit, sondern ein 1-Hz-Aufwachen, das den Faden nie zur Ruhe kommen liess — auf
  // dem Handy ist das Akku.
  useTick(format === "short" ? 1000 : 60_000);
  const now = new Date();

  const diffMs = mode === "countup"
    ? now.getTime() - target.getTime()
    : target.getTime() - now.getTime();

  // For countdown: calculate remaining ratio for phase colors
  if (mode === "countdown" && diffMs <= 0 && onExpire) {
    onExpire();
  }

  // Farbe NUR beim Countdown: dort bedeutet sie etwas — die Phasenfarbe wird lauter, je weniger
  // Zeit bleibt, also markiert sie eine Frist, die etwas will. Beim Hochzählen bedeutet sie nichts,
  // und ein fest verdrahtetes `text-lock` machte jede laufende Dauer zur Signalfarbe, egal wofür
  // sie steht: die Zeit seit dem ÖFFNEN erschien damit in der Farbe für „verschlossen".
  const colorClass = mode === "countdown" ? phaseColor(Math.max(0, diffMs), warnAtMs, criticalAtMs) : "";

  const isExpired = mode === "countdown" && diffMs <= 0;
  const displayMs = isExpired ? 0 : Math.abs(diffMs);
  // `format="long"` setzte seine Einheiten bis Etappe A selbst zusammen — und zwar fest auf
  // Englisch ("2d 3h 14m"), obwohl es die grösste Zahl des offenen Dashboards ist. Jetzt über
  // `formatElapsedMs`, also mit denselben Einheiten wie jede andere laufende Dauer.
  const formatted = format === "long" ? formatElapsedMs(displayMs, locale) : formatShort(displayMs);
  const prefix = isExpired && mode === "countdown" ? "-" : "";

  return (
    // Weder `font-mono` noch `font-bold` in der Basis: die Schnitt-Entscheidung gehört dorthin, wo
    // die Zahl steht. Als Held trägt sie `text-zahl font-semibold`, in der Kopfleiste die
    // Fliesstext-Grösse — eine fest verdrahtete Monoschrift machte aus jeder Dauer eine
    // Maschinenanzeige.
    //
    // `tabular-nums` bleibt HIER und wird nicht der Aufrufstelle überlassen, obwohl zwei von drei
    // es ohnehin mitbringen: gleich breite Ziffern sind bei einer tickenden Zahl kein Stil, sondern
    // die Bedingung dafür, dass sie nicht zappelt. Eine Eigenschaft, ohne die das Bauteil falsch
    // aussieht, gehört ins Bauteil.
    //
    // KEIN `aria-live`: es sass auf einem Element, dessen Inhalt im Sekundentakt neu geschrieben
    // wird. Der Screenreader sagte die Dauer endlos an und unterbrach sich dabei selbst — auf dem
    // Dashboard mit laufender Session war nichts anderes mehr hörbar. Der Wert steht im Text und
    // `aria-label` benennt ihn; wer hinnavigiert, bekommt ihn.
    <span
      className={["tabular-nums", colorClass, className].filter(Boolean).join(" ")}
      suppressHydrationWarning
    >
      {/* Als sr-only-TEXT, nicht als `aria-label`: das Element ist ein `<span>` ohne Rolle
          (`role=generic`), und dort ist `aria-label` nach ARIA 1.2 unzulässig — VoiceOver und NVDA
          verwerfen es. Ohne diesen Vorspann wären Hoch- und Herunterzählen akustisch nicht mehr zu
          unterscheiden: beide sagten nur „4T 9h 43min". */}
      {srPrefix && <span className="sr-only">{tc(mode === "countdown" ? "remaining" : "elapsed")}: </span>}
      {prefix}{formatted}
    </span>
  );
}
