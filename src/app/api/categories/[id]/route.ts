import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi, deviceCategoriesGate } from "@/lib/authGuards";
import { validateCategoryInput } from "@/lib/categoryConstants";

type Params = { params: Promise<{ id: string }> };

/** Ownership check: returns the category if the session user owns it (or is admin). */
async function getOwnedCategory(id: string, sessionUserId: string, sessionRole: string) {
  const category = await prisma.deviceCategory.findUnique({ where: { id } });
  if (!category) return null;
  if (category.userId !== sessionUserId && sessionRole !== "admin") return null;
  return category;
}

/** PATCH /api/categories/[id] — update name, color, icon, sortOrder.
 *  Built-in: slug + isBuiltIn + trackingEnabled are immutable; name/color/icon are editable. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const category = await getOwnedCategory(id, session.user.id, session.user.role);
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, color, icon, sortOrder, trackingEnabled, requirePhoto, allowVorgaben } = body;

  const validationError = validateCategoryInput({ name, color, icon });
  if (validationError) return NextResponse.json({ error: validationError.error }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = (name as string).trim();
  if (color !== undefined) data.color = color;
  if (icon !== undefined) data.icon = icon;
  if (sortOrder !== undefined && typeof sortOrder === "number") data.sortOrder = sortOrder;
  if (trackingEnabled !== undefined && typeof trackingEnabled === "boolean") data.trackingEnabled = trackingEnabled;
  if (requirePhoto !== undefined && typeof requirePhoto === "boolean") data.requirePhoto = requirePhoto;
  if (allowVorgaben !== undefined && typeof allowVorgaben === "boolean") data.allowVorgaben = allowVorgaben;

  const updated = await prisma.deviceCategory.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/** DELETE /api/categories/[id] — delete user-defined category if no devices/vorgaben link to it.
 *  Built-in cannot be deleted. Returns 409 if linked records exist. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const category = await getOwnedCategory(id, session.user.id, session.user.role);
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (category.isBuiltIn) {
    return NextResponse.json({ error: "Eingebaute Kategorien können nicht gelöscht werden" }, { status: 400 });
  }

  const [deviceCount, vorgabeCount] = await Promise.all([
    prisma.device.count({ where: { categoryId: id } }),
    // B-04: bewusst OHNE deletedAt-Filter — TrainingVorgabe.categoryId hat ON DELETE SET NULL; würde
    // eine Kategorie mit nur noch soft-gelöschten Zielen löschbar, verlöre deren Historie stillschweigend
    // die Kategorie-Zuordnung (fällt auf "KG" zurück). Historische Ziele blockieren die Löschung daher
    // weiterhin, exakt wie aktive.
    prisma.trainingVorgabe.count({ where: { categoryId: id } }),
  ]);
  if (deviceCount > 0 || vorgabeCount > 0) {
    return NextResponse.json({
      error: "Kategorie wird verwendet (Geräte oder Vorgaben verknüpft)",
      deviceCount,
      vorgabeCount,
    }, { status: 409 });
  }

  await prisma.deviceCategory.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
