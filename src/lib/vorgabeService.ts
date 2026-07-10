import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";

export interface CreateVorgabeParams {
  userId: string;
  categoryId?: string | null;
  gueltigAb: string | Date;
  gueltigBis?: string | Date | null;
  // Optional: ob `gueltigBis` bewusst gesetzt ist (schützt vor Auto-Verkettung). Fehlt der Wert,
  // gilt jedes gesetzte Enddatum als manuell (`!!gueltigBis`) — korrekt für Create und MCP. Nur
  // das Admin-Edit-Formular übergibt ihn explizit, um vorbefüllte (abgeleitete) Enden nicht
  // versehentlich als manuell einzufrieren.
  validUntilManual?: boolean;
  minProTagH?: number | null;
  minProWocheH?: number | null;
  minProMonatH?: number | null;
  minProJahrH?: number | null;
  notiz?: string | null;
}

/** Validates that a category exists, belongs to `userId`, and allows Vorgaben.
 *  Returns an error ServiceResult on failure, or null when valid / no category given.
 *  Existenz + Besitz kommen aus `resolveOwnedCategory` (geteilt mit den Geräte-Routen); nur die
 *  `allowVorgaben`-Regel unten ist eine Vorgaben-Regel und bleibt hier. */
async function validateVorgabeCategory(
  categoryId: string | null | undefined,
  userId: string,
): Promise<ServiceResult<never> | null> {
  const owned = await resolveOwnedCategory(categoryId, userId);
  if (!owned.ok) return owned;
  // Built-in (KG) always allows vorgaben; user-defined respects the toggle.
  if (owned.data && !owned.data.isBuiltIn && !owned.data.allowVorgaben) {
    return serviceFail(400, "CATEGORY_DISALLOWS_GOALS");
  }
  return null;
}

/** At least one of the four period targets must be set. */
function hasPeriodTarget(p: { minProTagH?: number | null; minProWocheH?: number | null; minProMonatH?: number | null; minProJahrH?: number | null }): boolean {
  return !!(p.minProTagH || p.minProWocheH || p.minProMonatH || p.minProJahrH);
}

/**
 * Creates a TrainingVorgabe (wear goal) for a user / category.
 * Shared by POST /api/admin/vorgaben and the MCP write tool. At least one period target required.
 */
export async function createVorgabe(params: CreateVorgabeParams): Promise<ServiceResult<{ id: string }>> {
  const { userId, categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, minProJahrH, notiz } = params;

  if (!userId || !gueltigAb) return serviceFail(400, "GOAL_USER_AND_START_REQUIRED");
  if (!hasPeriodTarget(params)) return serviceFail(400, "GOAL_PERIOD_TARGET_REQUIRED");
  const catErr = await validateVorgabeCategory(categoryId, userId);
  if (catErr) return catErr;

  const vorgabe = await prisma.trainingVorgabe.create({
    data: {
      userId,
      categoryId: categoryId || null,
      gueltigAb: new Date(gueltigAb),
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      validUntilManual: params.validUntilManual ?? !!gueltigBis, // explizit gesetztes Ende gegen Auto-Verkettung schützen
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      minProJahrH: minProJahrH ?? null,
      notiz: notiz || null,
    },
  });

  await reorderVorgabenDates(userId);

  return { ok: true, data: { id: vorgabe.id } };
}

export type UpdateVorgabeParams = Omit<CreateVorgabeParams, "userId">;

/**
 * Replaces a TrainingVorgabe's values by id (overwrite semantics, like the admin form).
 * Shared by PATCH /api/admin/vorgaben/[id] and the MCP edit_training_goal tool.
 */
export async function updateVorgabe(id: string, params: UpdateVorgabeParams): Promise<ServiceResult<{ id: string; userId: string }>> {
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return serviceFail(404, "GOAL_NOT_FOUND");

  const { categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, minProJahrH, notiz } = params;
  if (!gueltigAb) return serviceFail(400, "GOAL_START_REQUIRED");
  if (!hasPeriodTarget(params)) return serviceFail(400, "GOAL_PERIOD_TARGET_REQUIRED");
  const catErr = await validateVorgabeCategory(categoryId, existing.userId);
  if (catErr) return catErr;

  await prisma.trainingVorgabe.update({
    where: { id },
    data: {
      ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
      gueltigAb: new Date(gueltigAb),
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      validUntilManual: params.validUntilManual ?? !!gueltigBis, // explizit gesetztes Ende gegen Auto-Verkettung schützen
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      minProJahrH: minProJahrH ?? null,
      notiz: notiz ?? null,
    },
  });
  await reorderVorgabenDates(existing.userId);
  return { ok: true, data: { id, userId: existing.userId } };
}

/** Deletes a TrainingVorgabe by id. Shared by DELETE /api/admin/vorgaben/[id] and the MCP tool. */
export async function deleteVorgabe(id: string): Promise<ServiceResult<{ userId: string }>> {
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return serviceFail(404, "GOAL_NOT_FOUND");
  await prisma.trainingVorgabe.delete({ where: { id } });
  await reorderVorgabenDates(existing.userId);
  return { ok: true, data: { userId: existing.userId } };
}

/** Lists a user's training goals (chained per category), newest category-block first, with category names. */
export async function listVorgaben(userId: string) {
  return prisma.trainingVorgabe.findMany({
    where: { userId },
    orderBy: [{ categoryId: "asc" }, { gueltigAb: "asc" }],
    include: { category: { select: { name: true } } },
  });
}
