import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { entryManageAccess } from "@/lib/keyholder";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl, VALID_CURRENCIES, DEVICE_NAME_MAX_LENGTH, DEVICE_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
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
  const { name, description, imageUrl, purchasePrice, currency, categoryId } = body;

  // Admin OR keyholder of the target may create devices for that user
  let userId = session.user.id;
  if (body.userId && body.userId !== session.user.id) {
    if (!(await entryManageAccess(session.user.id, session.user.role, body.userId)).allowed) {
      return errorResponse(403, "FORBIDDEN");
    }
    userId = body.userId;
  }

  // Validation
  if (!name || typeof name !== "string" || !name.trim()) {
    return errorResponse(400, "DEVICE_NAME_REQUIRED");
  }
  if (name.trim().length > DEVICE_NAME_MAX_LENGTH) {
    return errorResponse(400, "DEVICE_NAME_TOO_LONG");
  }
  if (description && typeof description === "string" && description.length > DEVICE_DESCRIPTION_MAX_LENGTH) {
    return errorResponse(400, "DEVICE_DESCRIPTION_TOO_LONG");
  }
  if (!isValidImageUrl(imageUrl)) {
    return errorResponse(400, "INVALID_IMAGE_URL");
  }
  if (purchasePrice != null && (typeof purchasePrice !== "number" || purchasePrice < 0)) {
    return errorResponse(400, "DEVICE_INVALID_PRICE");
  }
  if (currency && !(VALID_CURRENCIES as readonly string[]).includes(currency)) {
    return errorResponse(400, "DEVICE_INVALID_CURRENCY");
  }
  if (purchasePrice != null && !currency) {
    return errorResponse(400, "DEVICE_CURRENCY_REQUIRED");
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
    },
  });

  return NextResponse.json(device, { status: 201 });
}
