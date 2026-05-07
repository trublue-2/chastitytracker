import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl, VALID_CURRENCIES, DEVICE_NAME_MAX_LENGTH, DEVICE_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";

/**
 * GET /api/devices
 * Returns the current user's devices.
 * Admin may pass ?userId=<id> to fetch another user's devices.
 * Pass ?includeArchived=true to include soft-deleted devices.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const includeArchived = searchParams.get("includeArchived") === "true";

  // Admin can view any user's devices
  let userId = session.user.id;
  const queryUserId = searchParams.get("userId");
  if (queryUserId) {
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, imageUrl, purchasePrice, currency, categoryId } = body;

  // Admin can create devices for other users
  let userId = session.user.id;
  if (body.userId && body.userId !== session.user.id) {
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = body.userId;
  }

  // Validation
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }
  if (name.trim().length > DEVICE_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: `Name zu lang (max. ${DEVICE_NAME_MAX_LENGTH} Zeichen)` }, { status: 400 });
  }
  if (description && typeof description === "string" && description.length > DEVICE_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Beschreibung zu lang (max. ${DEVICE_DESCRIPTION_MAX_LENGTH} Zeichen)` }, { status: 400 });
  }
  if (!isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Ungültige imageUrl" }, { status: 400 });
  }
  if (purchasePrice != null && (typeof purchasePrice !== "number" || purchasePrice < 0)) {
    return NextResponse.json({ error: "Ungültiger Preis" }, { status: 400 });
  }
  if (currency && !(VALID_CURRENCIES as readonly string[]).includes(currency)) {
    return NextResponse.json({ error: "Ungültige Währung" }, { status: 400 });
  }
  if (purchasePrice != null && !currency) {
    return NextResponse.json({ error: "Währung ist erforderlich wenn Preis angegeben" }, { status: 400 });
  }
  if (categoryId !== undefined && categoryId !== null) {
    if (typeof categoryId !== "string") return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
    const cat = await prisma.deviceCategory.findUnique({ where: { id: categoryId }, select: { userId: true } });
    if (!cat || cat.userId !== userId) return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
  }

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
