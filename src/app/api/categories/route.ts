import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi, deviceCategoriesGate } from "@/lib/authGuards";
import {
  validateCategoryInput,
  slugifyCategoryName,
  DEFAULT_USER_CATEGORY_COLOR,
  DEFAULT_USER_CATEGORY_ICON,
  CATEGORY_SLUG_MAX_LENGTH,
} from "@/lib/categoryConstants";

const MAX_SLUG_SUFFIX = 99;

/** Picks a unique slug given a base, fetching all colliding slugs in one query.
 *  Returns null if MAX_SLUG_SUFFIX is exhausted (caller should respond with 409). */
async function pickUniqueCategorySlug(userId: string, baseSlug: string): Promise<string | null> {
  const taken = new Set(
    (await prisma.deviceCategory.findMany({
      where: { userId, slug: { startsWith: baseSlug } },
      select: { slug: true },
    })).map((c) => c.slug),
  );
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = 2; i <= MAX_SLUG_SUFFIX; i++) {
    const candidate = `${baseSlug}-${i}`.slice(0, CATEGORY_SLUG_MAX_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

/** GET /api/categories — list current user's DeviceCategories.
 *  Admin may pass ?userId=<id> to fetch another user's categories.
 *  Includes counts (devices, vorgaben) so the list page can show usage. */
export async function GET(req: NextRequest) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  let userId = session.user.id;
  const queryUserId = req.nextUrl.searchParams.get("userId");
  if (queryUserId && queryUserId !== session.user.id) {
    if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    userId = queryUserId;
  }

  const categories = await prisma.deviceCategory.findMany({
    where: { userId },
    orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      icon: true,
      isBuiltIn: true,
      trackingEnabled: true,
      requirePhoto: true,
      allowVorgaben: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { devices: true, vorgaben: true } },
    },
  });

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      icon: c.icon,
      isBuiltIn: c.isBuiltIn,
      trackingEnabled: c.trackingEnabled,
      requirePhoto: c.requirePhoto,
      allowVorgaben: c.allowVorgaben,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
      deviceCount: c._count.devices,
      vorgabeCount: c._count.vorgaben,
    })),
  );
}

/** POST /api/categories — create a new user-defined DeviceCategory.
 *  Built-in (slug "kg") cannot be created via API — it's seeded by ensureKgCategory. */
export async function POST(req: NextRequest) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { name, color, icon, sortOrder, trackingEnabled, requirePhoto, allowVorgaben } = body;

  let userId = session.user.id;
  if (body.userId && body.userId !== session.user.id) {
    if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    userId = body.userId;
  }

  const validationError = validateCategoryInput({ name, color, icon });
  if (validationError) return NextResponse.json({ error: validationError.error }, { status: 400 });

  const baseSlug = slugifyCategoryName((name as string).trim()) || "category";
  const slug = await pickUniqueCategorySlug(userId, baseSlug);
  if (!slug) {
    return NextResponse.json({ error: "Zu viele Kategorien mit ähnlichem Namen" }, { status: 409 });
  }
  const slugError = validateCategoryInput({ slug });
  if (slugError) return NextResponse.json({ error: slugError.error }, { status: 400 });

  const created = await prisma.deviceCategory.create({
    data: {
      userId,
      name: (name as string).trim(),
      slug,
      color: (color as string | undefined) ?? DEFAULT_USER_CATEGORY_COLOR,
      icon: (icon as string | undefined) ?? DEFAULT_USER_CATEGORY_ICON,
      isBuiltIn: false,
      trackingEnabled: typeof trackingEnabled === "boolean" ? trackingEnabled : true,
      requirePhoto: typeof requirePhoto === "boolean" ? requirePhoto : false,
      allowVorgaben: typeof allowVorgaben === "boolean" ? allowVorgaben : true,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
