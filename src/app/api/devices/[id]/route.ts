import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl, VALID_CURRENCIES, DEVICE_NAME_MAX_LENGTH, DEVICE_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";

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
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const device = await getOwnedDevice(id, session.user.id, session.user.role);
  if (!device) return errorResponse(404, "NOT_FOUND");

  const body = await req.json();

  // Restore archived device
  if (body.action === "restore") {
    if (!device.archivedAt) {
      return errorResponse(400, "DEVICE_NOT_ARCHIVED");
    }
    const updated = await prisma.device.update({
      where: { id },
      // version: OCC-Token der MCP-Edits — jeder Device-Write bumpt es, damit ein Keyholder-Agent
      // mit expectedVersion auch UI-seitige Änderungen als Konflikt erkennt (siehe mcp/writeFramework).
      data: { archivedAt: null, version: { increment: 1 } },
    });
    return NextResponse.json(updated);
  }

  // Cannot edit archived devices (restore first)
  if (device.archivedAt) {
    return errorResponse(400, "DEVICE_ARCHIVED_NOT_EDITABLE");
  }

  const { name, description, imageUrl, purchasePrice, currency, categoryId } = body;

  // Validation (only validate provided fields)
  if (name !== undefined) {
    if (!name || typeof name !== "string" || !name.trim()) {
      return errorResponse(400, "DEVICE_NAME_REQUIRED");
    }
    if (name.trim().length > DEVICE_NAME_MAX_LENGTH) {
      return errorResponse(400, "DEVICE_NAME_TOO_LONG");
    }
  }
  if (description !== undefined && typeof description === "string" && description.length > DEVICE_DESCRIPTION_MAX_LENGTH) {
    return errorResponse(400, "DEVICE_DESCRIPTION_TOO_LONG");
  }
  if (imageUrl !== undefined && !isValidImageUrl(imageUrl)) {
    return errorResponse(400, "INVALID_IMAGE_URL");
  }
  if (purchasePrice !== undefined && purchasePrice != null && (typeof purchasePrice !== "number" || purchasePrice < 0)) {
    return errorResponse(400, "DEVICE_INVALID_PRICE");
  }

  // Determine effective currency: use provided, or keep existing
  const effectiveCurrency = currency !== undefined ? currency : device.currency;
  const effectivePrice = purchasePrice !== undefined ? purchasePrice : device.purchasePrice;

  if (effectiveCurrency && !(VALID_CURRENCIES as readonly string[]).includes(effectiveCurrency)) {
    return errorResponse(400, "DEVICE_INVALID_CURRENCY");
  }
  if (effectivePrice != null && !effectiveCurrency) {
    return errorResponse(400, "DEVICE_CURRENCY_REQUIRED");
  }

  // Ownership is checked against the DEVICE's owner, not the session user: an admin editing another
  // user's device must file it under a category of THAT user.
  const category = await resolveOwnedCategory(categoryId, device.userId);
  if (!category.ok) return serviceFailure(category);

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (imageUrl !== undefined) data.imageUrl = imageUrl || null;
  if (purchasePrice !== undefined) data.purchasePrice = purchasePrice ?? null;
  if (currency !== undefined) data.currency = currency || null;
  if (categoryId !== undefined) data.categoryId = categoryId || null;

  // version: OCC-Token der MCP-Edits — bumpen, sobald wirklich Felder geändert werden (No-op nicht).
  if (Object.keys(data).length) data.version = { increment: 1 };

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
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const device = await getOwnedDevice(id, session.user.id, session.user.role);
  if (!device) return errorResponse(404, "NOT_FOUND");

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
    // version-Bump: Archivieren ändert das MCP-DTO (archived) — siehe restore/PATCH oben.
    data: { archivedAt: new Date(), version: { increment: 1 } },
  });
  return NextResponse.json({ archived: true });
}
