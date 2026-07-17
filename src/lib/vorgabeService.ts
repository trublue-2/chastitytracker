import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

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

/** At least one of the four period targets must be set. Exported for MCP dryRun previews
 *  (mcpWrite.ts) — the same check the real create/update path runs, not restated there. */
export function hasPeriodTarget(p: { minProTagH?: number | null; minProWocheH?: number | null; minProMonatH?: number | null; minProJahrH?: number | null }): boolean {
  return !!(p.minProTagH || p.minProWocheH || p.minProMonatH || p.minProJahrH);
}

/** Physikalische Obergrenze je Periode (Stunden der längsten Periodeninstanz — 31-Tage-Monat,
 *  366-Tage-Schaltjahr) UND wie viele Tage eine Woche/ein Monat/ein Jahr höchstens hat, für die
 *  Quer-Konsistenz gegen das Tagesziel. */
const PERIOD_HOUR_CAP = { tag: 24, woche: 168, monat: 744, jahr: 8784 } as const;
const PERIOD_DAYS_VS_TAG = { woche: 7, monat: 31, jahr: 366 } as const;

/**
 * Plausibilitätsschranken für Trainingsziel-Stundenwerte (B-02, MCP-Befundliste 2026-07-17): ohne
 * sie akzeptierte der Tracker z.B. 25 Std/Tag oder 500 Std/Woche unkommentiert — beides schlägt
 * direkt in `goals.*.todayPct` durch und damit in die Adhärenz-Argumentation gegenüber dem Sub.
 *
 * Zwei Arten von Schranken, geprüft in dieser Reihenfolge (das Spezifischere zuerst): die absolute
 * Obergrenze jeder Periode (eine Woche hat nie mehr als 168 Stunden), dann die Quer-Konsistenz
 * gegen das Tagesziel (ein Wochenziel, das bei perfekter Tageserfüllung unerreichbar ist, ist in
 * sich widersprüchlich — nur sinnvoll geprüft, wenn ein Tagesziel überhaupt gesetzt ist).
 *
 * "Gesetzt" heisst hier `tag` truthy, nicht bloss `!= null`: `0` ist der einzige Wert, mit dem ein
 * MCP-Aufrufer ein Tagesziel explizit LÖSCHEN kann (die Zod-Schranke lässt `null` nicht zu, nur
 * `nonnegative().optional()`) — und `hasPeriodTarget()` oben behandelt `0` bereits genauso als
 * "nicht gesetzt". Mit `!= null` würde `minPerDayHours: 0, minPerWeekHours: 40` (Wechsel von
 * "8h/Tag + 40h/Woche" auf "nur noch wochenweise") fälschlich als "40 > 7×0" abgelehnt.
 */
export function checkGoalPlausibility(p: {
  minProTagH?: number | null; minProWocheH?: number | null; minProMonatH?: number | null; minProJahrH?: number | null;
}): ServiceErrorCode | null {
  const { minProTagH: tag, minProWocheH: woche, minProMonatH: monat, minProJahrH: jahr } = p;
  if (tag != null && tag > PERIOD_HOUR_CAP.tag) return "GOAL_DAY_TARGET_TOO_HIGH";
  if (woche != null && woche > PERIOD_HOUR_CAP.woche) return "GOAL_WEEK_TARGET_TOO_HIGH";
  if (monat != null && monat > PERIOD_HOUR_CAP.monat) return "GOAL_MONTH_TARGET_TOO_HIGH";
  if (jahr != null && jahr > PERIOD_HOUR_CAP.jahr) return "GOAL_YEAR_TARGET_TOO_HIGH";
  if (tag) {
    if (woche != null && woche > PERIOD_DAYS_VS_TAG.woche * tag) return "GOAL_WEEK_UNREACHABLE_VS_DAY";
    if (monat != null && monat > PERIOD_DAYS_VS_TAG.monat * tag) return "GOAL_MONTH_UNREACHABLE_VS_DAY";
    if (jahr != null && jahr > PERIOD_DAYS_VS_TAG.jahr * tag) return "GOAL_YEAR_UNREACHABLE_VS_DAY";
  }
  return null;
}

/**
 * Creates a TrainingVorgabe (wear goal) for a user / category.
 * Shared by POST /api/admin/vorgaben and the MCP write tool. At least one period target required.
 */
export async function createVorgabe(params: CreateVorgabeParams): Promise<ServiceResult<{ id: string }>> {
  const { userId, categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, minProJahrH, notiz } = params;

  if (!userId || !gueltigAb) return serviceFail(400, "GOAL_USER_AND_START_REQUIRED");
  if (!hasPeriodTarget(params)) return serviceFail(400, "GOAL_PERIOD_TARGET_REQUIRED");
  const plausibilityErr = checkGoalPlausibility(params);
  if (plausibilityErr) return serviceFail(400, plausibilityErr);
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
  const plausibilityErr = checkGoalPlausibility(params);
  if (plausibilityErr) return serviceFail(400, plausibilityErr);
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
