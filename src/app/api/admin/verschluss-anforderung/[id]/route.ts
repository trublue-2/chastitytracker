import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!va) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const err = await requireKeyholderOrAdminApi(va.userId);
  if (err) return err;

  const { action } = await req.json();

  if (action === "withdraw") {
    await prisma.verschlussAnforderung.update({
      where: { id },
      data: { withdrawnAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
