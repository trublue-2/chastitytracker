import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weightTrackingEnabled } from "@/lib/constants";
import { APP_TZ, formatDate, toDateLocale } from "@/lib/utils";
import { effectiveTarget, startWeightIn, weightDayKey, type UnitSystem } from "@/lib/weight";
import { WEIGHT_USER_SELECT } from "@/lib/weightService";
import { loadWeightRows } from "@/lib/weightRows";
import { openWeightRelease } from "@/lib/weightReleaseService";
import type { WeightStatsCardProps } from "@/app/components/WeightStatsCard";

/**
 * Was die Gewichts-Karte der Statistik braucht — `null`, wenn das Feature hier nichts zu suchen hat.
 *
 * Dieselbe Rollen-Trennung wie im Erfassungs-Formular: **Einheit vom Betrachter, Daten vom Träger.**
 * `/admin/users/[id]/stats` zeigt einen Träger, aber gelesen wird die Seite von der Keyholderin —
 * sie darf Pfund sehen, während er in Kilogramm wiegt.
 *
 * Die Datums-Beschriftungen entstehen hier und nicht in der Karte: Locale und Zeitzone sind auf dem
 * Server bekannt, und eine Client-Komponente, die selbst formatiert, liefert bis zur Hydration eine
 * andere Zeichenkette als der Server — genau die Sorte Abweichung, die React als Hydration-Fehler
 * meldet.
 */
export async function getWeightStatsProps(subUserId: string): Promise<WeightStatsCardProps | null> {
  if (!weightTrackingEnabled()) return null;

  const sub = await prisma.user.findUnique({ where: { id: subUserId }, select: WEIGHT_USER_SELECT });
  if (!sub?.weightTrackingEnabled) return null;

  // Die vollen Zeilen, nicht nur die vier Felder des Diagramms: unter der Kurve steht dieselbe
  // Reihe noch einmal als Liste, und die zeigt Foto, Notiz und den von der Waage gelesenen Wert.
  // Eine zweite Abfrage dafür wäre dieselben Zeilen ein zweites Mal.
  const [rows, session, locale, release] = await Promise.all([
    loadWeightRows(subUserId),
    auth(),
    getLocale(),
    // Die Schwelle der Vorgabe gehört ins Diagramm: sie ist die Linie, gegen die er rechnet.
    openWeightRelease(subUserId),
  ]);
  if (rows.length === 0) return null;

  // `loadWeightRows` liefert die ANZEIGE-Reihenfolge (jüngste zuerst); Reihe und Startgewicht
  // rechnen vorwärts. Eine Kopie, damit die Liste ihre Reihenfolge behält.
  const ascending = [...rows].reverse();

  // Die Einheit des Betrachters. Schaut er auf sich selbst, ist es dieselbe Zeile — dann spart die
  // Abfrage sich, weil `sub` sie schon hätte; der Fall ist es nicht wert, die Auswahl oben
  // aufzublähen.
  const viewerId = session?.user?.id;
  const viewer = viewerId
    ? await prisma.user.findUnique({ where: { id: viewerId }, select: { unitSystem: true } })
    : null;

  const dl = toDateLocale(locale);
  const dateLabels: Record<string, string> = {};
  for (const row of rows) {
    // Mittag UTC als Anker: der Schlüssel ist ein Kalendertag ohne Uhrzeit, und jede andere Stunde
    // könnte beim Formatieren in einer Zeitzone auf den Vor- oder Folgetag rutschen.
    dateLabels[row.dayKey] = formatDate(new Date(`${row.dayKey}T12:00:00Z`), dl, "UTC");
  }

  const target = effectiveTarget(sub);
  return {
    points: ascending,
    rows,
    target,
    // Aus der bereits geladenen Reihe, nicht per zweiter Abfrage: `ascending` ist vollständig und
    // aufsteigend sortiert — genau das, was `startWeightIn` erwartet.
    startKg: target ? startWeightIn(ascending, target.setAt) : null,
    heightCm: sub.heightCm,
    unitSystem: ((viewer?.unitSystem ?? "metric") as UnitSystem),
    locale: dl,
    tz: sub.timezone || APP_TZ,
    todayKey: weightDayKey(new Date(), sub.timezone || APP_TZ),
    dateLabels,
    releaseThresholdKg: release?.thresholdKg ?? null,
  };
}
