import { round1 } from "@/lib/utils";
import { dayNumber, type WeightTarget } from "@/lib/weight";

/**
 * Aus den erfassten Messungen die Reihe machen, die das Diagramm zeichnet: Punkte, Trendlinie,
 * Spanne, Kennzahlen.
 *
 * Rein und ohne Datenbank — deshalb testbar und in Client wie Server benutzbar. Die Aufteilung ist
 * Absicht: **was** gezeichnet wird, entscheidet sich hier; **wie** es aussieht, im Diagramm.
 */

export interface WeightPoint {
  /** `YYYY-MM-DD` in der Zeitzone des Trägers — der Schlüssel, unter dem die Messung zählt. */
  dayKey: string;
  weightKg: number;
  /** Lag die Messung in einem Wiege-Fenster? Ausserhalb gemessene Werte bleiben aus dem Trend. */
  inWindow: boolean;
}

export interface WeightSeries {
  points: WeightPoint[];
  /** Gleitendes Mittel je Tag mit Punkt — `null`, wo es keinen gibt. */
  trend: { dayKey: string; weightKg: number }[];
  minKg: number;
  maxKg: number;
  latest: WeightPoint | null;
  /** Veränderung gegenüber der ältesten Messung im Zeitraum. `null` bei weniger als zwei Werten. */
  changeKg: number | null;
}

/**
 * Die Breite des gleitenden Mittels — sieben Tage.
 *
 * Tagesgewicht schwankt um ein bis zwei Kilo (Salz, Mahlzeit, Tageszeit). Ohne Glättung liest man
 * dieses Rauschen statt der Richtung; eine Woche deckt genau einen vollen Wochenrhythmus ab.
 */
export const TREND_WINDOW_DAYS = 7;

/**
 * Das gleitende Mittel über ein **Kalender-Fenster**, nicht über die letzten N Punkte.
 *
 * Der Unterschied ist der ganze Sinn der Funktion: wer drei Wochen nicht gewogen hat und dann
 * wieder anfängt, bekäme bei einer Punkt-Zählung ein „Wochenmittel", das über einen Monat mittelt —
 * die Linie zöge den alten Stand in die Gegenwart und zeigte einen Verlauf, den es nie gab. Über
 * das Kalender-Fenster gerechnet bleibt sie nach einer Lücke einfach der neue Wert.
 *
 * Quadratisch in der Punktzahl (Fenster je Punkt neu gefiltert) — bei einem Wert je Tag ist das
 * selbst über Jahre eine kurze Liste, und ein gleitender Zeiger wäre mehr Sorgfaltspflicht als
 * Ersparnis.
 */
export function movingAverage(points: WeightPoint[], windowDays = TREND_WINDOW_DAYS): { dayKey: string; weightKg: number }[] {
  const sorted = [...points].sort((a, b) => dayNumber(a.dayKey) - dayNumber(b.dayKey));
  return sorted.map((p) => {
    const end = dayNumber(p.dayKey);
    const start = end - (windowDays - 1);
    const within = sorted.filter((q) => {
      const n = dayNumber(q.dayKey);
      return n >= start && n <= end;
    });
    const sum = within.reduce((acc, q) => acc + q.weightKg, 0);
    return { dayKey: p.dayKey, weightKg: round1(sum / within.length) };
  });
}

/**
 * Die Reihe für einen Zeitraum.
 *
 * `days === null` heisst „seit Beginn". Gefiltert wird über den TAGESSCHLÜSSEL und nicht über die
 * Messzeit: der Zeitraum ist in Kalendertagen des Trägers gemeint, und „die letzten 30 Tage" soll
 * nicht davon abhängen, ob er morgens oder abends auf der Waage stand.
 */
export function buildWeightSeries(
  all: WeightPoint[],
  // `target` geht NICHT als Feld zurück: die Reihe braucht es allein für die Achsen-Spanne, und
  // jeder Leser hält es ohnehin selbst in der Hand.
  opts: { days: number | null; todayKey: string; target: WeightTarget | null },
): WeightSeries {
  const today = dayNumber(opts.todayKey);
  const { days } = opts;
  const points = (days === null ? [...all] : all.filter((p) => dayNumber(p.dayKey) > today - days))
    .sort((a, b) => dayNumber(a.dayKey) - dayNumber(b.dayKey));

  // Der Trend lässt Messungen ausserhalb der Wiege-Fenster aus. Sie sind echte Beobachtungen und
  // bleiben als Punkte sichtbar — aber ein abends nach dem Essen gemessener Wert gehört nicht in
  // dieselbe Reihe wie die morgendlichen, sonst misst die Linie die Tageszeit mit.
  const trend = movingAverage(points.filter((p) => p.inWindow));

  // Die Spanne umfasst auch das Ziel: eine Linie, die aus dem Bild läuft, zeigt nicht, wie weit es
  // noch ist — und genau dafür ist sie da.
  const spanValues = [
    ...points.map((p) => p.weightKg),
    ...(opts.target ? [opts.target.kg] : []),
  ];
  return {
    points,
    trend,
    // Ohne jeden Wert bewusst 0/0 statt der ±Unendlich, die `Math.min()` auf einer leeren Liste
    // liefert: das Diagramm zeichnet in dem Fall ohnehin nichts, aber eine unendliche Achse würde
    // beim ersten Aufrufer, der weniger sorgfältig prüft, zu NaN-Koordinaten.
    minKg: spanValues.length ? Math.min(...spanValues) : 0,
    maxKg: spanValues.length ? Math.max(...spanValues) : 0,
    latest: points.length ? points[points.length - 1] : null,
    changeKg: points.length >= 2 ? round1(points[points.length - 1].weightKg - points[0].weightKg) : null,
  };
}
