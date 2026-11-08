"use client";

import { useTranslations } from "next-intl";
import Card from "./Card";
import MeasurementChart from "./MeasurementChart";
import { JOURNAL_MOOD_MAX, JOURNAL_MOOD_MIN } from "@/lib/shared/constants";

/** Ein Punkt, wie er vom Server kommt — Zeit als Millisekunden, damit die Grenze serialisierbar ist. */
export interface MoodChartPoint {
  x: number;
  mood: number;
  private: boolean;
  /** Kalendertag in der Zeitzone des Subs — die Gruppe des Tagesmittels. */
  day: string;
}

/**
 * Der Stimmungsverlauf aus dem Tagebuch: einzelne Einträge als Punkte, das Tagesmittel als Linie.
 * Keine Bewertung und kein Ranking — die Kurve zeigt einen groben Verlauf, mehr nicht.
 *
 * In der eigenen Sicht stehen private Werte abgesetzt (`muted`) im Bild: der Sub sieht alle seine
 * Werte und erkennt, welche er nicht teilt. Die Keyholderin bekommt solche Punkte gar nicht erst.
 */
export default function JournalMoodCard({ points, showPrivateNote }: { points: MoodChartPoint[]; showPrivateNote: boolean }) {
  const t = useTranslations("journal");

  const byDay = new Map<string, { xs: number[]; moods: number[] }>();
  for (const p of points) {
    const g = byDay.get(p.day) ?? { xs: [], moods: [] };
    g.xs.push(p.x);
    g.moods.push(p.mood);
    byDay.set(p.day, g);
  }
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const trend = [...byDay.values()].map((g) => ({ x: avg(g.xs), value: avg(g.moods) }));

  return (
    <Card className="flex flex-col gap-2">
      <MeasurementChart
        points={points.map((p) => ({ x: p.x, value: p.mood, muted: p.private }))}
        trend={trend}
        domain={{ min: JOURNAL_MOOD_MIN, max: JOURNAL_MOOD_MAX }}
        unit=""
        ticks={[JOURNAL_MOOD_MIN, (JOURNAL_MOOD_MIN + JOURNAL_MOOD_MAX) / 2, JOURNAL_MOOD_MAX]}
        ariaLabel={t("moodChartAria")}
      />
      <p className="text-neben text-foreground-faint">
        {t("moodChartCount", { count: points.length })}
        {showPrivateNote && points.some((p) => p.private) && <> · {t("moodChartPrivateNote")}</>}
      </p>
    </Card>
  );
}
