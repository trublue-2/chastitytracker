/** Geräte-Nutzung je Kategorie: aus Sessions wird pro Gerät Anzahl, Gesamt-/Ø-Dauer und Kosten
 *  pro Stunde. EINE Auswertung für alle Kategorien — die Sessions selbst kommen je nach Kategorie
 *  aus verschiedenen Quellen (KG aus den Verschluss-Paaren, Wear aus `buildWearSessions`), die
 *  RECHNUNG darüber ist geteilt. */

/** Geräte-Stammdaten, soweit die Nutzungs-Auswertung sie braucht. */
export interface UsageDevice {
  id: string;
  name: string;
  purchasePrice: number | null;
  currency: string | null;
}

/** Eine Session, reduziert auf das, was die Auswertung braucht: welches Gerät, wie lange. */
export interface UsageSession {
  deviceId: string | null;
  durationMs: number;
}

export interface DeviceUsageRow {
  /** null = Sessions ohne zugeordnetes Gerät (Alt-Einträge vor der Geräte-Verwaltung). */
  id: string | null;
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  /** null, wenn kein Kaufpreis hinterlegt ist oder noch keine Tragezeit vorliegt. */
  costPerHour: number | null;
  currency: string | null;
}

const HOUR_MS = 3_600_000;

/** Summiert Sessions je Gerät, längste Nutzung zuerst. `unknownName` beschriftet Sessions ohne
 *  Geräte-Zuordnung. `deviceById` kommt vom Aufrufer, damit der Index bei mehreren Kategorien
 *  einmal gebaut wird statt je Kategorie neu. */
export function buildDeviceUsage(
  sessions: UsageSession[],
  deviceById: Map<string, UsageDevice>,
  unknownName: string,
): DeviceUsageRow[] {
  const totals = new Map<string | null, { count: number; totalMs: number }>();

  for (const s of sessions) {
    const row = totals.get(s.deviceId) ?? { count: 0, totalMs: 0 };
    row.count++;
    row.totalMs += s.durationMs;
    totals.set(s.deviceId, row);
  }

  return [...totals.entries()]
    .map(([id, { count, totalMs }]) => {
      const device = id ? deviceById.get(id) : undefined;
      const totalHours = totalMs / HOUR_MS;
      return {
        id,
        name: device?.name ?? unknownName,
        count,
        totalMs,
        avgMs: count > 0 ? Math.round(totalMs / count) : 0,
        costPerHour: device?.purchasePrice && totalHours > 0 ? device.purchasePrice / totalHours : null,
        currency: device?.currency ?? null,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}
