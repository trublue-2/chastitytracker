import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const err = await requireKeyholderOrAdminApi(existing.userId);
  if (err) return err;

  const { categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } = await req.json();
  if (categoryId !== undefined && categoryId !== null) {
    if (typeof categoryId !== "string") return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
    const cat = await prisma.deviceCategory.findUnique({
      where: { id: categoryId },
      select: { userId: true, allowVorgaben: true, isBuiltIn: true },
    });
    if (!cat || cat.userId !== existing.userId) return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
    if (!cat.isBuiltIn && !cat.allowVorgaben) {
      return NextResponse.json({ error: "Diese Kategorie erlaubt keine Trainingsvorgaben" }, { status: 400 });
    }
  }
  const vorgabe = await prisma.trainingVorgabe.update({
    where: { id },
    data: {
      ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
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
  const { id } = await params;
  const toDelete = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!toDelete) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const err = await requireKeyholderOrAdminApi(toDelete.userId);
  if (err) return err;

  const deleted = await prisma.trainingVorgabe.delete({ where: { id }, select: { userId: true } });
  await reorderVorgabenDates(deleted.userId);
  return new NextResponse(null, { status: 204 });
}
