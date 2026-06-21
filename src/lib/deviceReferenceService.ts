import { readFile, writeFile } from "fs/promises";
import { join, basename } from "path";
import { prisma } from "@/lib/prisma";
import { uploadsDirPath, generateUploadFilename } from "@/lib/imageUtils";
import { visionMaxRefsPerDevice } from "@/lib/constants";
import type { DeviceReference } from "@/lib/detectDevice";
import type { ServiceResult } from "@/lib/serviceResult";

/**
 * Sammelt die Referenzbilder JE aktivem KG-Gerät für die Vision-Erkennung: bevorzugt kuratierte
 * DeviceReferenceImage (Cap 5), sonst Fallback (Geräte-Foto + letzte 2 Verschluss-Fotos). Liefert
 * einen Eintrag pro Gerät (auch ohne Bilder → leere imageUrls). Geteilt von /api/detect-device
 * und dem Kontroll-Geräte-Check.
 */
export async function gatherDeviceReferences(userId: string): Promise<DeviceReference[]> {
  const MAX_REFS_PER_DEVICE = visionMaxRefsPerDevice();
  const devices = await prisma.device.findMany({
    where: { userId, archivedAt: null, OR: [{ category: { isBuiltIn: true } }, { categoryId: null }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });
  if (devices.length === 0) return [];

  const curatedByDevice = await Promise.all(
    devices.map((d) =>
      prisma.deviceReferenceImage.findMany({
        where: { deviceId: d.id },
        select: { imageUrl: true },
        orderBy: { createdAt: "desc" },
        take: MAX_REFS_PER_DEVICE,
      })
    )
  );
  // Fallback-Fotos NUR für Geräte ohne kuratierte Referenzen.
  const fallbackByDevice = await Promise.all(
    devices.map((d, i) =>
      curatedByDevice[i].length > 0
        ? Promise.resolve([] as { imageUrl: string | null }[])
        : prisma.entry.findMany({
            where: { userId, type: "VERSCHLUSS", deviceId: d.id, imageUrl: { not: null } },
            select: { imageUrl: true },
            orderBy: { startTime: "desc" },
            take: 2,
          })
    )
  );

  return devices.map((device, i) => {
    const curated = curatedByDevice[i].map((r) => r.imageUrl);
    if (curated.length > 0) return { deviceId: device.id, deviceName: device.name, imageUrls: curated };
    const imageUrls: string[] = [];
    if (device.imageUrl) imageUrls.push(device.imageUrl);
    for (const e of fallbackByDevice[i]) if (e.imageUrl) imageUrls.push(e.imageUrl);
    return { deviceId: device.id, deviceName: device.name, imageUrls: imageUrls.slice(0, MAX_REFS_PER_DEVICE) };
  });
}

/**
 * Kuratierte Geräte-Referenzfotos („Trainingsmaterial" für die Geräte-Erkennung).
 * Geteilt von den /api/devices/[id]/references-Routen. Referenzbilder werden als eigene
 * Datei-KOPIE unter data/uploads abgelegt (robust gegen Löschen des Quell-Entries).
 */

/** Kopiert eine vorhandene Upload-Datei zu einer neuen Referenz-Datei; gibt die neue imageUrl zurück. */
async function copyUploadFile(sourceImageUrl: string): Promise<string | null> {
  const src = basename(sourceImageUrl);
  if (!src || src.includes("..") || src.includes("/")) return null;
  try {
    const buf = await readFile(join(uploadsDirPath(), src));
    const filename = generateUploadFilename("ref-");
    await writeFile(join(uploadsDirPath(), filename), buf);
    return `/api/uploads/${filename}`;
  } catch {
    return null;
  }
}

export async function listDeviceReferences(deviceId: string) {
  return prisma.deviceReferenceImage.findMany({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, imageUrl: true, sourceEntryId: true, note: true, createdAt: true },
  });
}

/** Frisch hochgeladenes Bild (bereits eigenständige Upload-Datei) als Referenz speichern. */
export async function addReferenceFromUpload(
  deviceId: string,
  imageUrl: string,
  note?: string | null,
): Promise<ServiceResult<{ id: string }>> {
  const ref = await prisma.deviceReferenceImage.create({
    data: { deviceId, imageUrl, note: note?.trim() || null },
    select: { id: true },
  });
  return { ok: true, data: { id: ref.id } };
}

/** Foto eines bestehenden (eigenen) Entries als Referenz übernehmen — Datei wird KOPIERT. */
export async function importEntryAsReference(
  deviceId: string,
  entryId: string,
  userId: string,
): Promise<ServiceResult<{ id: string }>> {
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId },
    select: { id: true, imageUrl: true },
  });
  if (!entry?.imageUrl) return { ok: false, status: 404, error: "Entry oder Foto nicht gefunden" };

  const copied = await copyUploadFile(entry.imageUrl);
  if (!copied) return { ok: false, status: 500, error: "Foto konnte nicht kopiert werden" };

  const ref = await prisma.deviceReferenceImage.create({
    data: { deviceId, imageUrl: copied, sourceEntryId: entry.id },
    select: { id: true },
  });
  return { ok: true, data: { id: ref.id } };
}

/** Startbestand: die letzten N Verschluss-Fotos dieses Geräts als Referenzen importieren. */
export async function importRecentVerschluss(
  deviceId: string,
  userId: string,
  limit = 5,
): Promise<ServiceResult<{ imported: number }>> {
  const entries = await prisma.entry.findMany({
    where: { userId, deviceId, type: "VERSCHLUSS", imageUrl: { not: null } },
    orderBy: { startTime: "desc" },
    take: Math.min(Math.max(1, limit), 10),
    select: { id: true, imageUrl: true },
  });
  // Bereits importierte (per sourceEntryId) überspringen — idempotent.
  const existing = await prisma.deviceReferenceImage.findMany({
    where: { deviceId, sourceEntryId: { in: entries.map((e) => e.id) } },
    select: { sourceEntryId: true },
  });
  const done = new Set(existing.map((e) => e.sourceEntryId));

  let imported = 0;
  for (const e of entries) {
    if (done.has(e.id) || !e.imageUrl) continue;
    const copied = await copyUploadFile(e.imageUrl);
    if (!copied) continue;
    await prisma.deviceReferenceImage.create({ data: { deviceId, imageUrl: copied, sourceEntryId: e.id } });
    imported++;
  }
  return { ok: true, data: { imported } };
}

/** Referenz löschen. `userId` = Owner-Scope (Nicht-Admin); `null` = Admin (kein Owner-Filter).
 *  Datei bleibt liegen (konsistent mit dem App-Verhalten — Upload-Dateien werden nicht gelöscht). */
export async function deleteReference(refId: string, userId: string | null): Promise<ServiceResult<null>> {
  const res = await prisma.deviceReferenceImage.deleteMany({
    where: { id: refId, ...(userId ? { device: { userId } } : {}) },
  });
  if (res.count === 0) return { ok: false, status: 404, error: "Referenz nicht gefunden" };
  return { ok: true, data: null };
}
