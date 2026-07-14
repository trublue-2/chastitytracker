import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { updateVorgabe, deleteVorgabe } from "@/lib/vorgabeService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return errorResponse(404, "NOT_FOUND");

  const err = await requireKeyholderOrAdminApi(existing.userId);
  if (err) return err;

  const result = await updateVorgabe(id, await req.json());
  if (!result.ok) return serviceFailure(result);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return errorResponse(404, "NOT_FOUND");

  const err = await requireKeyholderOrAdminApi(existing.userId);
  if (err) return err;

  const result = await deleteVorgabe(id);
  if (!result.ok) return serviceFailure(result);
  return new NextResponse(null, { status: 204 });
}
