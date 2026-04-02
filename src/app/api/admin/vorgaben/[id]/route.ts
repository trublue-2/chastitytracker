import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { requireAdminApi } from "@/lib/authGuards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;
  const { id } = await params;
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } = await req.json();
  const vorgabe = await prisma.trainingVorgabe.update({
    where: { id },
    data: {
      gueltigAb: new Date(gueltigAb),
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      notiz: notiz ?? null,
    },
  });
  await reorderVorgabenDates(vorgabe.userId);
  return NextResponse.json(vorgabe);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;

  const { id } = await params;
  const toDelete = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!toDelete) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await prisma.trainingVorgabe.delete({ where: { id }, select: { userId: true } });
  await reorderVorgabenDates(deleted.userId);
  return new NextResponse(null, { status: 204 });
}
