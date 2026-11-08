import { prisma } from "@/lib/prisma";
import type { TxClient } from "@/lib/mcp/writeFramework";

/**
 * Was ein „Gerät löschen" bedeutet — die eine Regel für die Oberfläche (`DELETE /api/devices/[id]`)
 * und den MCP-Write (`delete_device`).
 *
 * Beide entschieden das vorher getrennt, und sie waren bereits uneins: die Route liess ein bereits
 * archiviertes Gerät unangetastet, der MCP-Pfad hätte es bei null Einträgen nachträglich hart
 * gelöscht — dieselbe Frage, zwei Antworten, und die folgenreichere davon unwiderruflich.
 */
export interface DeviceRemovalPlan {
  /** `deleted` = hart löschen (es gibt keine Historie zu bewahren), `archived` = Historie behalten. */
  outcome: "deleted" | "archived";
  entryCount: number;
  alreadyArchived: boolean;
}

/**
 * Entscheidet — ohne zu schreiben —, was mit dem Gerät passiert. Rein lesend, damit die MCP-Vorschau
 * den Ausgang ankündigen kann, den der Commit danach tatsächlich nimmt.
 *
 * Ein schon archiviertes Gerät bleibt archiviert: das Archivieren ist der bewusste Endzustand, und
 * ein zweiter Löschbefehl darf ihn nicht in ein Hart-Löschen umdeuten.
 */
export async function planDeviceRemoval(
  client: TxClient,
  device: { id: string; archivedAt: Date | null },
): Promise<DeviceRemovalPlan> {
  const alreadyArchived = device.archivedAt !== null;
  const entryCount = await client.entry.count({ where: { deviceId: device.id } });
  return {
    outcome: alreadyArchived || entryCount > 0 ? "archived" : "deleted",
    entryCount,
    alreadyArchived,
  };
}

/**
 * Führt den Plan aus und liefert die verwaisten BILDDATEIEN zurück, statt sie selbst zu löschen:
 * die Route räumt sofort auf, der MCP erst nach dem Commit seiner Transaktion (siehe
 * `WriteResult.afterCommit`) — ein Rollback nähme sonst die Geräte-Zeile zurück, während die Fotos
 * schon weg wären.
 *
 * Beim harten Löschen kaskadieren die Referenzbild-ZEILEN, ihre Dateien nicht.
 */
export async function applyDeviceRemoval(
  client: TxClient,
  device: { id: string; imageUrl: string | null },
  plan: DeviceRemovalPlan,
): Promise<string[]> {
  if (plan.outcome === "deleted") {
    const refs = await client.deviceReferenceImage.findMany({
      where: { deviceId: device.id },
      select: { imageUrl: true },
    });
    await client.device.delete({ where: { id: device.id } });
    return [device.imageUrl, ...refs.map((r) => r.imageUrl)].filter((u): u is string => !!u);
  }
  if (!plan.alreadyArchived) {
    // version: OCC-Token der MCP-Edits — Archivieren ändert das Geräte-DTO (`archived`), also bumpen.
    await client.device.update({
      where: { id: device.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
  }
  return [];
}

/** Plan + Ausführung in einem Schritt, für Aufrufer ohne eigene Transaktion (die HTTP-Route). */
export async function removeDevice(
  device: { id: string; imageUrl: string | null; archivedAt: Date | null },
): Promise<{ plan: DeviceRemovalPlan; orphanFiles: string[] }> {
  const plan = await planDeviceRemoval(prisma, device);
  return { plan, orphanFiles: await applyDeviceRemoval(prisma, device, plan) };
}
