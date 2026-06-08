import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { updateSperrzeitEnde } from "@/lib/verschlussAnforderungService";

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

  const body = await req.json();

  if (body.action === "withdraw") {
    await prisma.verschlussAnforderung.update({
      where: { id },
      data: { withdrawnAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // setEnd: extend/shorten an active Sperrzeit. indefinite=true → open-ended; else endetAt (ISO).
  if (body.action === "setEnd") {
    const endetAt = body.indefinite ? null : new Date(body.endetAt);
    if (!body.indefinite && Number.isNaN(endetAt!.getTime())) {
      return NextResponse.json({ error: "Ungültiges Ende" }, { status: 400 });
    }
    const result = await updateSperrzeitEnde(id, endetAt);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
