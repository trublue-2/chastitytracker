import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { entryManageAccess } from "@/lib/keyholder";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl, validateDeviceInput } from "@/lib/constants";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";
import { removeDevice } from "@/lib/deviceService";

type Params = { params: Promise<{ id: string }> };

/** Access check: returns the device if the session user may manage it — owner, global admin, or
 *  keyholder of the owner (same rule as entries, see entryManageAccess).
 *
 *  `elevated` kommt mit zurück (= handelt als Keyholder/Admin, nicht als Eigentümer): der Guard
 *  berechnet es ohnehin, und die Code-Pflicht unten braucht genau diese Unterscheidung. Ein zweiter
 *  Aufruf wäre dieselbe Frage ein zweites Mal — inklusive derselben Query. */
async function getOwnedDevice(id: string, sessionUserId: string, sessionRole: string) {
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) return null;
  const access = await entryManageAccess(sessionUserId, sessionRole, device.userId);
  if (!access.allowed) return null;
  return { ...device, elevated: access.elevated };
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

  const { name, description, imageUrl, purchasePrice, currency, categoryId, requireInspectionCode } = body;

  // Nur angegebene Felder prüfen; Preis und Währung dagegen als EFFEKTIVE Werte (wer nur den Preis
  // setzt, erbt die bestehende Währung) — die Kette selbst steht im Service, geteilt mit POST und
  // dem MCP-Write.
  const invalid = validateDeviceInput({
    name,
    description,
    purchasePrice: purchasePrice !== undefined ? purchasePrice : device.purchasePrice,
    currency: (currency !== undefined ? currency : device.currency) || undefined,
  });
  if (invalid) return errorResponse(400, invalid);
  if (imageUrl !== undefined && !isValidImageUrl(imageUrl)) {
    return errorResponse(400, "INVALID_IMAGE_URL");
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

  // Die Kontroll-Code-Pflicht ist KEIN Selbst-Feld: sie abzuschalten schwächt eine Kontrolle, und ein
  // Sub, der das an seinem eigenen Gerät darf, kontrolliert sich nicht mehr. Nur ein Keyholder/Admin
  // (`elevated`) darf sie schreiben — dieselbe Schranke, die auch das Bearbeiten fremder Einträge
  // regelt. Für den Eigentümer ist das Feld sichtbar, aber gesperrt (siehe DeviceFormSheet).
  if (requireInspectionCode !== undefined) {
    if (typeof requireInspectionCode !== "boolean") {
      return errorResponse(400, "DEVICE_INVALID_CODE_REQUIREMENT");
    }
    if (!device.elevated) return errorResponse(403, "FORBIDDEN");
    data.requireInspectionCode = requireInspectionCode;
  }

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

  // Löschen oder archivieren entscheidet der Service — dieselbe Regel nimmt der MCP-Write.
  // H5: die verwaisten Bilddateien räumt der Aufrufer weg (die Referenz-DB-Zeilen kaskadieren).
  const { plan, orphanFiles } = await removeDevice(device);
  void deleteUploadedFiles(orphanFiles);
  return NextResponse.json(plan.outcome === "deleted" ? { deleted: true } : { archived: true });
}
