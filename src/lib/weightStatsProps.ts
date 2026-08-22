import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weightTrackingEnabled } from "@/lib/constants";
import { APP_TZ, formatDate, toDateLocale } from "@/lib/utils";
import { keyholderCorridorOf, subCorridorOf, weightDayKey, type UnitSystem } from "@/lib/weight";
import { WEIGHT_USER_SELECT } from "@/lib/weightService";
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

  const [rows, session, locale] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId: subUserId },
      orderBy: { measuredAt: "asc" },
      select: { dayKey: true, weightKg: true, inWindow: true },
    }),
    auth(),
    getLocale(),
  ]);
  if (rows.length === 0) return null;

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

  return {
    points: rows,
    subCorridor: subCorridorOf(sub),
    keyholderCorridor: keyholderCorridorOf(sub),
    heightCm: sub.heightCm,
    unitSystem: ((viewer?.unitSystem ?? "metric") as UnitSystem),
    todayKey: weightDayKey(new Date(), sub.timezone || APP_TZ),
    dateLabels,
  };
}
