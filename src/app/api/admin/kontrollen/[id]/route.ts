import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/shared/prisma";
import { requireKeyholderOrAdminActor, requireKeyholderOrAdminApi, sessionActor } from "@/lib/auth/authGuards";
import { resolveKontrolle, extendInspectionDeadline } from "@/lib/kontrollen/kontrolleService";
import { serviceFailure, errorResponse } from "@/lib/shared/serviceResult";
import { mapAnforderungStatus } from "@/lib/shared/utils";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return errorResponse(404, "NOT_FOUND");
  const err = await requireKeyholderOrAdminApi(ka.userId);
  if (err) return err;
  // Nur ein ECHTER Rückzug ist löschbar. Eine versäumte Kontrolle setzt zwar ebenfalls
  // `withdrawnAt`, trägt aber das Vergehen (`autoMarkedRemovedAt`) — sie zu löschen tilgte einen
  // Strafbuch-Eintrag. Die UI blendet die Aktion dort bereits aus; die Route darf sich darauf
  // nicht verlassen.
  if (mapAnforderungStatus(ka, new Date()) !== "withdrawn") {
    return errorResponse(400, "INSPECTION_NOT_WITHDRAWN");
  }

  await prisma.kontrollAnforderung.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, deadline } = await req.json();

  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id }, select: { userId: true } });
  if (!ka) return errorResponse(404, "NOT_FOUND");
  const actor = await requireKeyholderOrAdminActor(ka.userId);
  if (actor instanceof NextResponse) return actor;

  if (action === "extend") {
    const newDeadline = typeof deadline === "string" ? new Date(deadline) : null;
    if (!newDeadline || Number.isNaN(newDeadline.getTime())) return errorResponse(400, "INVALID_DATETIME");
    const extended = await extendInspectionDeadline(id, newDeadline, sessionActor(actor));
    if (!extended.ok) return serviceFailure(extended);
    return NextResponse.json({ ok: true });
  }

  const result = await resolveKontrolle(id, action, sessionActor(actor));
  if (!result.ok) return serviceFailure(result);
  return NextResponse.json({ ok: true });
}
