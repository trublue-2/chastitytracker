import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/authGuards";

export async function POST(req: Request) {
  const err = await requireAdminApi();
  if (err) return err;

  const body = await req.json();
  const { userId, offenseType, refId, bestraftDatum, notiz } = body;

  if (!userId || !offenseType || !refId || !bestraftDatum) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["KONTROLLANFORDERUNG", "OEFFNEN_ENTRY", "VERSCHLUSS_ANFORDERUNG"].includes(offenseType)) {
    return NextResponse.json({ error: "Invalid offenseType" }, { status: 400 });
  }

  // IDOR check: verify the referenced record belongs to userId
  if (offenseType === "KONTROLLANFORDERUNG") {
    const ka = await prisma.kontrollAnforderung.findUnique({ where: { id: refId } });
    if (!ka || ka.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (offenseType === "VERSCHLUSS_ANFORDERUNG") {
    const va = await prisma.verschlussAnforderung.findUnique({ where: { id: refId } });
    if (!va || va.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else {
    const entry = await prisma.entry.findUnique({ where: { id: refId } });
    if (!entry || entry.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rely on @unique constraint on refId — catch P2002 for clean error
  try {
    const record = await prisma.strafeRecord.create({
      data: {
        userId,
        offenseType,
        refId,
        bestraftDatum: new Date(bestraftDatum + "T12:00:00Z"),
        notiz: notiz?.trim() || null,
      },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Already punished" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(req: Request) {
  const err = await requireAdminApi();
  if (err) return err;

  const { refId } = await req.json();
  if (!refId) return NextResponse.json({ error: "Missing refId" }, { status: 400 });

  const record = await prisma.strafeRecord.findUnique({ where: { refId } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.strafeRecord.delete({ where: { refId } });
  return NextResponse.json({ ok: true });
}
