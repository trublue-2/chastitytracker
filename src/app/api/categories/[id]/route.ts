import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi, deviceCategoriesGate } from "@/lib/authGuards";
import { entryManageAccess } from "@/lib/keyholder";
import { validateCategoryInput } from "@/lib/categoryConstants";
import { errorResponse } from "@/lib/serviceResult";
import { resolveCategoryRuleChanges, currentCategoryRules, categoryUsage, categoryDeleteBlock } from "@/lib/deviceCategoryService";

type Params = { params: Promise<{ id: string }> };

/** Access check: returns the category if the session user may manage it — owner, global admin, or
 *  keyholder of the owner (same rule as entries/devices, see entryManageAccess).
 *
 *  `elevated` kommt mit zurück (= handelt als Keyholder/Admin, nicht als Eigentümer) — dieselbe
 *  Erweiterung und dieselbe Begründung wie bei `getOwnedDevice`: der Guard berechnet es ohnehin, und
 *  die drei Kategorie-REGELN unten brauchen genau diese Unterscheidung. */
async function getOwnedCategory(id: string, sessionUserId: string, sessionRole: string) {
  const category = await prisma.deviceCategory.findUnique({ where: { id } });
  if (!category) return null;
  const access = await entryManageAccess(sessionUserId, sessionRole, category.userId);
  if (!access.allowed) return null;
  return { ...category, elevated: access.elevated };
}


/** PATCH /api/categories/[id] — Beschriftung (Name, Farbe, Symbol, Sortierung) für den Eigentümer,
 *  die drei REGELN nur für Keyholder/Admin (siehe {@link CATEGORY_RULE_FIELDS}).
 *  Bei der eingebauten Kategorie sind Slug, `isBuiltIn` und die drei Regeln unveränderlich. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const category = await getOwnedCategory(id, session.user.id, session.user.role);
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, color, icon, sortOrder } = body;

  const validationError = validateCategoryInput({ name, color, icon });
  if (validationError) return NextResponse.json({ error: validationError.error }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = (name as string).trim();
  if (color !== undefined) data.color = color;
  if (icon !== undefined) data.icon = icon;
  if (sortOrder !== undefined && typeof sortOrder === "number") data.sortOrder = sortOrder;

  // Die drei Regeln gehören dem Keyholder — die Entscheidung darüber steht im Service, damit
  // Anlegen und Ändern dieselbe treffen (und sie ohne Prisma prüfbar bleibt).
  const rules = resolveCategoryRuleChanges(
    body,
    currentCategoryRules(category),
    { isBuiltIn: category.isBuiltIn, elevated: category.elevated },
  );
  if (!rules.ok) return errorResponse(rules.status, rules.code);
  Object.assign(data, rules.data);

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

  // Welche Verweise blockieren (und warum auch archivierte Geräte und historische Ziele zählen),
  // steht im Service — dieselbe Entscheidung trifft der MCP-Write.
  const usage = await categoryUsage(prisma, id);
  if (categoryDeleteBlock(category, usage) === "in-use") {
    return NextResponse.json({
      error: "Kategorie wird verwendet (Geräte oder Vorgaben verknüpft)",
      deviceCount: usage.deviceCount,
      vorgabeCount: usage.goalCount,
    }, { status: 409 });
  }

  await prisma.deviceCategory.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
