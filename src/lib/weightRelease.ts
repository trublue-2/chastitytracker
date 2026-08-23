import { round1 } from "@/lib/utils";
import { dayNumber, weightDayKey } from "@/lib/weight";
import { movingAverage, type WeightPoint } from "@/lib/weightSeries";

/**
 * Die Freigabe-Vorgabe: wann das Gewicht das nächste Orgasmus-Fenster öffnet
 * (docs/gewicht-freigabe-konzept.md).
 *
 * Rein und ohne Datenbank — deshalb testbar, und die MCP-Dry-Run-Vorschau ruft dieselbe Funktion
 * auf, statt die Kette abzuschreiben (Muster: `checkTask()` in `taskService.ts`). **Eine neue
 * Schranke gehört hierher**, nicht in eine zweite Bedingungskette daneben.
 */

/** Wohin das Mittel muss. `below` = darunter (abnehmen), `above` = darüber (zunehmen). */
export const RELEASE_DIRECTIONS = ["below", "above"] as const;
export type ReleaseDirection = (typeof RELEASE_DIRECTIONS)[number];

export function isReleaseDirection(v: unknown): v is ReleaseDirection {
  return typeof v === "string" && (RELEASE_DIRECTIONS as readonly string[]).includes(v);
}

/** Die Felder der Vorgabe, die die Rechnung liest — nicht die ganze Zeile, damit ein Aufrufer sie
 *  auch aus einem Formular-Entwurf zusammenstecken kann (Vorschau, bevor etwas gespeichert ist). */
export interface ReleaseRule {
  thresholdKg: number;
  direction: string;
  averageDays: number;
  minMeasurements: number;
  stepKg: number;
  notBeforeAt: Date;
  armedAt: Date;
}

/**
 * Die Schwelle des Tages.
 *
 * `stepKg` lässt sie täglich steigen — mit ihm kommt die Vorgabe dem Träger entgegen, statt auf
 * einer Zahl zu beharren. Gerechnet wird in TAGESSCHLÜSSELN des Trägers, nicht in Millisekunden:
 * sonst hinge die Schwelle daran, zu welcher Uhrzeit er sich wiegt.
 *
 * Bei `direction: "above"` sinkt sie stattdessen — der Anstieg ist als *Entgegenkommen* definiert,
 * nicht als Rechenrichtung, und wer zunehmen soll, dem kommt eine niedrigere Schwelle entgegen.
 *
 * Vor `armedAt` gilt die unveränderte Schwelle: eine rückwärts gerechnete Vorgabe wäre für Tage
 * schärfer, an denen sie noch gar nicht galt.
 */
export function thresholdOn(rule: ReleaseRule, dayKey: string, tz: string): number {
  const days = Math.max(0, dayNumber(dayKey) - dayNumber(weightDayKey(rule.armedAt, tz)));
  const drift = rule.stepKg * days;
  return round1(rule.direction === "above" ? rule.thresholdKg - drift : rule.thresholdKg + drift);
}

/** Warum eine Vorgabe (noch) nicht greift — zur Anzeige, nicht als Fehler. */
export type ReleaseBlockReason = "not_yet" | "too_few_measurements" | "above_threshold" | "below_threshold";

export interface ReleaseEvaluation {
  released: boolean;
  /** Das Mittel der letzten `averageDays` Tage; `null`, wenn zu wenige Messungen vorliegen. */
  averageKg: number | null;
  /** Wie viele zählende Messungen im Fenster lagen. */
  measurements: number;
  /** Die Schwelle, gegen die gerechnet wurde. */
  thresholdKg: number;
  /** Was noch fehlt — `null`, wenn die Vorgabe erfüllt ist. */
  reason: ReleaseBlockReason | null;
  /** Wie weit das Mittel noch von der Schwelle entfernt ist; `null` ohne Mittel, `0` wenn erreicht.
   *  Steht auch, solange die Mindestlaufzeit läuft — er soll wissen, wo er dann stünde. */
  remainingKg: number | null;
}

/**
 * Prüft die Vorgabe gegen die Messreihe — **ohne** die Frage, ob gerade eine Anforderung offen ist
 * oder ein Gesundheits-Halt läuft: das weiss nur die Datenbank, und diese Funktion soll ohne sie
 * auskommen. Der Dienst legt beides davor (`weightReleaseService.ts`).
 *
 * `points` sind die Messungen des Trägers, aufsteigend, bereits gefiltert auf die ZÄHLENDEN (nur
 * innerhalb der Wiege-Fenster — sonst geht ein Abendwert ins Mittel und die Freigabe misst die
 * Tageszeit mit).
 */
export function evaluateRelease(
  rule: ReleaseRule,
  points: readonly WeightPoint[],
  now: Date,
  tz: string,
): ReleaseEvaluation {
  const todayKey = weightDayKey(now, tz);
  const thresholdKg = thresholdOn(rule, todayKey, tz);

  // Das Mittel über ein KALENDER-Fenster, nicht über die letzten N Punkte: wer vier Tage nicht
  // gewogen hat und dann wieder anfängt, bekäme sonst ein „Dreitage-Mittel" über eine Woche — die
  // Freigabe hinge an Werten, die längst überholt sind. `movingAverage` rechnet genau so.
  const from = dayNumber(todayKey) - (rule.averageDays - 1);
  const inWindow = points.filter((p) => {
    const n = dayNumber(p.dayKey);
    return n >= from && n <= dayNumber(todayKey);
  });
  const measurements = inWindow.length;

  const blocked = (reason: ReleaseBlockReason, averageKg: number | null, remainingKg: number | null)
    : ReleaseEvaluation => ({ released: false, averageKg, measurements, thresholdKg, reason, remainingKg });

  if (measurements < rule.minMeasurements) return blocked("too_few_measurements", null, null);

  // Der letzte Punkt des gleitenden Mittels IST das Mittel des Fensters, das auf heute endet —
  // dieselbe Rechnung, die im Diagramm die Trendlinie zeichnet.
  const trend = movingAverage([...inWindow], rule.averageDays);
  const averageKg = trend[trend.length - 1].weightKg;

  const reached = rule.direction === "above" ? averageKg > thresholdKg : averageKg < thresholdKg;
  // Wie weit er noch entfernt ist — `0`, wenn er die Schwelle schon hält. Auch in den beiden Fällen
  // unten, in denen nichts öffnet: die Zahl ist der ganze Grund für die Anzeige. „Noch 0,5 kg" sagt
  // ihm, was ein Tag Geduld kostet; „noch nicht" sagt ihm gar nichts.
  const remainingKg = reached ? 0 : Math.abs(round1(averageKg - thresholdKg));

  // Vor der Mindestlaufzeit öffnet nichts, egal was die Waage sagt. Die Prüfung steht NACH dem
  // Mittel, damit die Anzeige auch währenddessen zeigt, wo er steht.
  if (now < rule.notBeforeAt) return blocked("not_yet", averageKg, remainingKg);

  if (!reached) {
    return blocked(
      rule.direction === "above" ? "below_threshold" : "above_threshold",
      averageKg,
      remainingKg,
    );
  }
  return { released: true, averageKg, measurements, thresholdKg, reason: null, remainingKg: 0 };
}
