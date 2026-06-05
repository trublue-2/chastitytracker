import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import type { ServiceResult } from "@/lib/serviceResult";

export interface CreateVorgabeParams {
  userId: string;
  categoryId?: string | null;
  gueltigAb: string | Date;
  gueltigBis?: string | Date | null;
  minProTagH?: number | null;
  minProWocheH?: number | null;
  minProMonatH?: number | null;
  notiz?: string | null;
}

/**
 * Creates a TrainingVorgabe (wear goal) for a user / category.
 * Shared by POST /api/admin/vorgaben and the MCP write tool. At least one period target required.
 */
export async function createVorgabe(params: CreateVorgabeParams): Promise<ServiceResult<{ id: string }>> {
  const { userId, categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } = params;

  if (!userId || !gueltigAb) return { ok: false, status: 400, error: "userId und gueltigAb sind erforderlich" };
  if (!minProTagH && !minProWocheH && !minProMonatH) {
    return { ok: false, status: 400, error: "Mindestens ein Zeitwert ist erforderlich" };
  }
  if (categoryId !== undefined && categoryId !== null) {
    if (typeof categoryId !== "string") return { ok: false, status: 400, error: "Ungültige Kategorie" };
    const cat = await prisma.deviceCategory.findUnique({
      where: { id: categoryId },
      select: { userId: true, allowVorgaben: true, isBuiltIn: true },
    });
    if (!cat || cat.userId !== userId) return { ok: false, status: 400, error: "Ungültige Kategorie" };
    // Built-in (KG) always allows vorgaben; user-defined respects the toggle.
    if (!cat.isBuiltIn && !cat.allowVorgaben) {
      return { ok: false, status: 400, error: "Diese Kategorie erlaubt keine Trainingsvorgaben" };
    }
  }

  const vorgabe = await prisma.trainingVorgabe.create({
    data: {
      userId,
      categoryId: categoryId || null,
      gueltigAb: new Date(gueltigAb),
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      notiz: notiz || null,
    },
  });

  await reorderVorgabenDates(userId);

  return { ok: true, data: { id: vorgabe.id } };
}
