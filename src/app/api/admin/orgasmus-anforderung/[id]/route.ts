import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { withdrawOrgasmusAnforderungById } from "@/lib/orgasmusAnforderungService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const oa = await prisma.orgasmusAnforderung.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!oa) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const err = await requireKeyholderOrAdminApi(oa.userId);
  if (err) return err;

  const body = await req.json();

  if (body.action === "withdraw") {
    const result = await withdrawOrgasmusAnforderungById(id, oa.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
