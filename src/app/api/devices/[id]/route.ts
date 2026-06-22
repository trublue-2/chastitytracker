import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl, VALID_CURRENCIES, DEVICE_NAME_MAX_LENGTH, DEVICE_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import { deleteUploadedFiles } from "@/lib/imageUtils";

type Params = { params: Promise<{ id: string }> };

/** Ownership check: returns the device if the session user owns it (or is admin). */
async function getOwnedDevice(id: string, sessionUserId: string, sessionRole: string) {
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) return null;
  if (device.userId !== sessionUserId && sessionRole !== "admin") return null;
  return device;
}

/**
 * PATCH /api/devices/[id]
 * Update device fields or restore an archived device (action: "restore").
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const device = await getOwnedDevice(id, session.user.id, session.user.role);
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Restore archived device
  if (body.action === "restore") {
    if (!device.archivedAt) {
      return NextResponse.json({ error: "Device ist nicht archiviert" }, { status: 400 });
    }
    const updated = await prisma.device.update({
      where: { id },
      data: { archivedAt: null },
    });
    return NextResponse.json(updated);
  }

  // Cannot edit archived devices (restore first)
  if (device.archivedAt) {
    return NextResponse.json({ error: "Archivierte Devices können nicht bearbeitet werden" }, { status: 400 });
  }

  const { name, description, imageUrl, purchasePrice, currency, categoryId } = body;

  // Validation (only validate provided fields)
  if (name !== undefined) {
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }
    if (name.trim().length > DEVICE_NAME_MAX_LENGTH) {
      return NextResponse.json({ error: `Name zu lang (max. ${DEVICE_NAME_MAX_LENGTH} Zeichen)` }, { status: 400 });
    }
  }
  if (description !== undefined && typeof description === "string" && description.length > DEVICE_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Beschreibung zu lang (max. ${DEVICE_DESCRIPTION_MAX_LENGTH} Zeichen)` }, { status: 400 });
  }
  if (imageUrl !== undefined && !isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Ungültige imageUrl" }, { status: 400 });
  }
  if (purchasePrice !== undefined && purchasePrice != null && (typeof purchasePrice !== "number" || purchasePrice < 0)) {
    return NextResponse.json({ error: "Ungültiger Preis" }, { status: 400 });
  }

  // Determine effective currency: use provided, or keep existing
  const effectiveCurrency = currency !== undefined ? currency : device.currency;
  const effectivePrice = purchasePrice !== undefined ? purchasePrice : device.purchasePrice;

  if (effectiveCurrency && !(VALID_CURRENCIES as readonly string[]).includes(effectiveCurrency)) {
    return NextResponse.json({ error: "Ungültige Währung" }, { status: 400 });
  }
  if (effectivePrice != null && !effectiveCurrency) {
    return NextResponse.json({ error: "Währung ist erforderlich wenn Preis angegeben" }, { status: 400 });
  }

  if (categoryId !== undefined && categoryId !== null) {
    if (typeof categoryId !== "string") return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
    const cat = await prisma.deviceCategory.findUnique({ where: { id: categoryId }, select: { userId: true } });
    if (!cat || cat.userId !== device.userId) return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (imageUrl !== undefined) data.imageUrl = imageUrl || null;
  if (purchasePrice !== undefined) data.purchasePrice = purchasePrice ?? null;
  if (currency !== undefined) data.currency = currency || null;
  if (categoryId !== undefined) data.categoryId = categoryId || null;

  const updated = await prisma.device.update({ where: { id }, data });

  // H5: wird das Geräte-Foto ersetzt, die alte verwaiste Datei löschen.
  if (imageUrl !== undefined && device.imageUrl && imageUrl !== device.imageUrl) {
    void deleteUploadedFiles([device.imageUrl]);
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/devices/[id]
 * Hard-delete if no entries reference this device.
 * Soft-delete (archive) if entries exist.
 * Returns { deleted: true } or { archived: true }.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const device = await getOwnedDevice(id, session.user.id, session.user.role);
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already archived → no-op
  if (device.archivedAt) {
    return NextResponse.json({ archived: true });
  }

  // Check if any entries reference this device
  const entryCount = await prisma.entry.count({ where: { deviceId: id } });

  if (entryCount === 0) {
    // Hard delete — no history to preserve. H5: Geräte-Foto + alle Referenzfotos von der Platte
    // entfernen (die Referenz-DB-Zeilen kaskadieren, die Dateien nicht).
    const refs = await prisma.deviceReferenceImage.findMany({ where: { deviceId: id }, select: { imageUrl: true } });
    await prisma.device.delete({ where: { id } });
    void deleteUploadedFiles([device.imageUrl, ...refs.map((r) => r.imageUrl)]);
    return NextResponse.json({ deleted: true });
  }

  // Soft delete — preserve history
  await prisma.device.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  return NextResponse.json({ archived: true });
}
