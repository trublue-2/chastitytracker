import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { resolveKontrolle } from "@/lib/kontrolleService";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const err = await requireKeyholderOrAdminApi(ka.userId);
  if (err) return err;
  if (!ka.withdrawnAt) return NextResponse.json({ error: "Nur zurückgezogene Kontrollen können gelöscht werden" }, { status: 400 });

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
  if (!ka) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const err = await requireKeyholderOrAdminApi(ka.userId);
  if (err) return err;

  const result = await resolveKontrolle(id, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
