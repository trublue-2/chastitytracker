import { summarizeDurations } from "@/lib/utils";

/** Geräte-Nutzung je Kategorie: aus Sessions wird pro Gerät Anzahl, Gesamt-/Ø-/Median-/Min-/Max-Dauer,
 *  „zuletzt getragen" und Kosten pro Stunde. EINE Auswertung für alle Kategorien — die Sessions
 *  selbst kommen je nach Kategorie aus verschiedenen Quellen (KG aus den Verschluss-Paaren, Wear aus
 *  `buildWearSessions`), die RECHNUNG darüber ist geteilt. Dieselben Kennzahlen nennt `device_stats`
 *  im MCP — die Zahlen im Chat und auf der Statistik-Seite sollen nicht auseinanderlaufen. */

/** Geräte-Stammdaten, soweit die Nutzungs-Auswertung sie braucht. */
export interface UsageDevice {
  id: string;
  name: string;
  purchasePrice: number | null;
  currency: string | null;
}

/** Eine Session, reduziert auf das, was die Auswertung braucht: welches Gerät, wann, wie lange. */
export interface UsageSession {
  deviceId: string | null;
  durationMs: number;
  /** Beginn der Session — treibt „zuletzt getragen". */
  start: Date;
}

export interface DeviceUsageRow {
  /** null = Sessions ohne zugeordnetes Gerät (Alt-Einträge vor der Geräte-Verwaltung). */
  id: string | null;
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  medianMs: number;
  /** Kürzeste bzw. längste EINZELNE Session dieses Geräts. */
  minMs: number;
  maxMs: number;
  /** Beginn der jüngsten Session dieses Geräts. */
  lastWorn: Date;
  /** null, wenn kein Kaufpreis hinterlegt ist oder noch keine Tragezeit vorliegt. */
  costPerHour: number | null;
  currency: string | null;
}

const HOUR_MS = 3_600_000;

/** Fasst Sessions je Gerät zusammen, längste Gesamtnutzung zuerst. `unknownName` beschriftet
 *  Sessions ohne Geräte-Zuordnung. `deviceById` kommt vom Aufrufer, damit der Index bei mehreren
 *  Kategorien einmal gebaut wird statt je Kategorie neu. */
export function buildDeviceUsage(
  sessions: UsageSession[],
  deviceById: Map<string, UsageDevice>,
  unknownName: string,
): DeviceUsageRow[] {
  const byDevice = new Map<string | null, { durations: number[]; lastWorn: Date }>();

  for (const s of sessions) {
    const row = byDevice.get(s.deviceId) ?? { durations: [], lastWorn: s.start };
    row.durations.push(s.durationMs);
    if (s.start > row.lastWorn) row.lastWorn = s.start;
    byDevice.set(s.deviceId, row);
  }

  return [...byDevice.entries()]
    .map(([id, { durations, lastWorn }]) => {
      const device = id ? deviceById.get(id) : undefined;
      const { count, totalMs, avgMs, medianMs, minMs, maxMs } = summarizeDurations(durations);
      const totalHours = totalMs / HOUR_MS;
      return {
        id,
        name: device?.name ?? unknownName,
        count,
        totalMs,
        avgMs: Math.round(avgMs),
        medianMs: Math.round(medianMs),
        minMs,
        maxMs,
        lastWorn,
        costPerHour: device?.purchasePrice && totalHours > 0 ? device.purchasePrice / totalHours : null,
        currency: device?.currency ?? null,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}
