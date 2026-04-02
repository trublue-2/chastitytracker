import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;

  const { id } = await params;
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
