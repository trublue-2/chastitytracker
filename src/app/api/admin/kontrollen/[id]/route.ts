import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { resolveKontrolle } from "@/lib/kontrolleService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";
import { mapAnforderungStatus } from "@/lib/utils";

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
  if (mapAnforderungStatus(ka, null, new Date()) !== "withdrawn") {
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
  const { action } = await req.json();

  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id }, select: { userId: true } });
  if (!ka) return errorResponse(404, "NOT_FOUND");
  const err = await requireKeyholderOrAdminApi(ka.userId);
  if (err) return err;

  const result = await resolveKontrolle(id, action);
  if (!result.ok) return serviceFailure(result);
  return NextResponse.json({ ok: true });
}
