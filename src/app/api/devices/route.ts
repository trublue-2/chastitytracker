import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { entryManageAccess } from "@/lib/keyholder";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl, validateDeviceInput } from "@/lib/constants";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";

/**
 * GET /api/devices
 * Returns the current user's devices.
 * Admin may pass ?userId=<id> to fetch another user's devices.
 * Pass ?includeArchived=true to include soft-deleted devices.
 */
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { searchParams } = req.nextUrl;
  const includeArchived = searchParams.get("includeArchived") === "true";

  // Admin OR keyholder of the target may view that user's devices
  let userId = session.user.id;
  const queryUserId = searchParams.get("userId");
  if (queryUserId && queryUserId !== session.user.id) {
    if (!(await entryManageAccess(session.user.id, session.user.role, queryUserId)).allowed) {
      return errorResponse(403, "FORBIDDEN");
    }
    userId = queryUserId;
  }

  const devices = await prisma.device.findMany({
    where: {
      userId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      purchasePrice: true,
      currency: true,
      createdAt: true,
      archivedAt: true,
    },
  });

  return NextResponse.json(devices);
}

/**
 * POST /api/devices
 * Creates a new device for the current user.
 * Admin may pass userId in the body to create for another user.
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { name, description, imageUrl, purchasePrice, currency, categoryId, requireInspectionCode } = body;

  // Admin OR keyholder of the target may create devices for that user
  let userId = session.user.id;
  // Handelt der Aufrufer als Keyholder/Admin? Für das eigene Gerät ist nur ein globaler Admin
  // erhaben — dieselbe Staffelung wie in `entryManageAccess`, die die PATCH-Route benutzt.
  let elevated = session.user.role === "admin";
  if (body.userId && body.userId !== session.user.id) {
    const access = await entryManageAccess(session.user.id, session.user.role, body.userId);
    if (!access.allowed) return errorResponse(403, "FORBIDDEN");
    userId = body.userId;
    elevated = access.elevated;
  }

  // Feld-Prüfung im Service — dieselbe Kette bedient die PATCH-Route und den MCP-Write. Beim
  // Anlegen sind die Body-Werte zugleich die effektiven (es gibt keinen Bestand zu erben).
  // `name ?? null` statt `name`: `undefined` hiesse in der Prüfung „Feld nicht angegeben" und würde
  // übersprungen — beim ANLEGEN ist ein fehlender Name aber genau der Fehler.
  const invalid = validateDeviceInput({ name: name ?? null, description, purchasePrice, currency: currency || undefined });
  if (invalid) return errorResponse(400, invalid);
  if (!isValidImageUrl(imageUrl)) {
    return errorResponse(400, "INVALID_IMAGE_URL");
  }
  // Die Kontroll-Code-Pflicht ist KEIN Selbst-Feld — dieselbe Schranke wie beim Bearbeiten
  // (siehe PATCH): sie abzuschalten schwächt eine Kontrolle. Fehlt sie im Body, greift der
  // Schema-Default `true`; ein neues Gerät verlangt also einen Code, bis jemand ihn abschaltet.
  if (requireInspectionCode !== undefined) {
    if (typeof requireInspectionCode !== "boolean") {
      return errorResponse(400, "DEVICE_INVALID_CODE_REQUIREMENT");
    }
    if (!elevated) return errorResponse(403, "FORBIDDEN");
  }

  const category = await resolveOwnedCategory(categoryId, userId);
  if (!category.ok) return serviceFailure(category);

  const device = await prisma.device.create({
    data: {
      userId,
      name: name.trim(),
      description: description?.trim() || null,
      imageUrl: imageUrl || null,
      purchasePrice: purchasePrice ?? null,
      currency: currency || null,
      categoryId: categoryId || null,
      ...(requireInspectionCode !== undefined ? { requireInspectionCode } : {}),
    },
  });

  return NextResponse.json(device, { status: 201 });
}
