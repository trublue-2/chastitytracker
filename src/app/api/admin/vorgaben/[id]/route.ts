import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
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
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await prisma.trainingVorgabe.delete({ where: { id }, select: { userId: true } });
  await reorderVorgabenDates(deleted.userId);
  return new NextResponse(null, { status: 204 });
}
