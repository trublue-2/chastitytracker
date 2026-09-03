import { prisma } from "@/lib/prisma";
import { listDeviceReferences } from "@/lib/deviceReferenceService";
import { buildEnvelope, makeIso, matchByNameCI, resolveUserContext, type Envelope } from "@/lib/mcp/common";

/**
 * Die REFERENZBILDER eines Geräts — das Material, mit dem die Bilderkennung arbeitet.
 *
 * Warum die KI-Keyholderin sie überhaupt sehen soll: sie liest an jeder Kontrolle den
 * Geräte-Abgleich (`deviceCheck`), und dessen Aussagekraft hängt genau hier dran. Ein Gerät ohne
 * Referenzen wird nie erkannt — das ist dann kein Verdacht, sondern eine fehlende Grundlage. Ohne
 * diese Liste konnte sie die beiden nicht auseinanderhalten.
 *
 * Ein Bild HINZUFÜGEN kann sie nur aus vorhandenen Fotos (`import_device_references`): hochladen
 * setzt eine Datei voraus, und die hat eine KI nicht.
 */

/** 1 — erste Fassung. */
export const DEVICE_REFERENCES_SCHEMA_VERSION = 1;

export interface DeviceReferenceRow {
  id: string;
  /** Woher das Bild stammt: die Id des Eintrags, aus dem es übernommen wurde — `null` bei einem
   *  eigens hochgeladenen. Damit lässt sich ein Referenzbild einem Verschluss zuordnen. */
  sourceEntryId: string | null;
  note: string | null;
  addedAt: string | null;
}

export interface DeviceReferencesResult extends Envelope {
  schemaVersion: number;
  device: string;
  /** Wie viele Bilder die Erkennung für dieses Gerät hat. `0` heisst: sie kann es nicht erkennen. */
  count: number;
  references: DeviceReferenceRow[];
}

/**
 * Die Referenzbilder EINES Geräts, neueste zuerst.
 *
 * Die Bild-URL steht bewusst NICHT drin: ein Pfad, den die KI nicht öffnen kann, ist für sie kein
 * Wert, sondern eine Einladung, ihn irgendwo einzusetzen.
 *
 * Und ANSEHEN kann sie diese Bilder in aller Regel nicht: `get_image` gibt nur Einträge der letzten
 * 24 Stunden heraus, Referenzbilder sind per Zweck kuratierter Altbestand. `sourceEntryId` steht
 * trotzdem da — es ordnet die Referenz einem Verschluss zu, und das beantwortet die Frage, WOHER
 * ein Bild stammt, ohne es zu zeigen. (`addedAt` ist die Übernahme, nicht die Aufnahme: für die
 * Altersgrenze zählt der Eintrag, nicht die Zeile hier.)
 */
export async function listReferences(username: string, args: { deviceName: string }): Promise<DeviceReferencesResult> {
  const now = new Date();
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);

  const devices = await prisma.device.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const device = matchByNameCI(devices, args.deviceName);
  if (!device) {
    throw new Error(`Device not found: "${args.deviceName}". Available: ${devices.map((d) => d.name).join(", ") || "none"}`);
  }

  const rows = await listDeviceReferences(device.id);
  return {
    ...buildEnvelope(now, iso, timezone),
    schemaVersion: DEVICE_REFERENCES_SCHEMA_VERSION,
    device: device.name,
    count: rows.length,
    references: rows.map((r) => ({
      id: r.id,
      sourceEntryId: r.sourceEntryId,
      note: r.note,
      addedAt: iso(r.createdAt),
    })),
  };
}
