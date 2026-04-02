import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"];
const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.entry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, verifikationStatus } = body;

  if (oeffnenGrund !== undefined && oeffnenGrund !== null && !OEFFNEN_GRUENDE.includes(oeffnenGrund)) {
    return NextResponse.json({ error: "Ungültiger Öffnungsgrund" }, { status: 400 });
  }
  if (orgasmusArt !== undefined && orgasmusArt !== null) {
    const base = (orgasmusArt as string).split(" – ")[0];
    if (!ORGASMUS_ARTEN.includes(base)) {
      return NextResponse.json({ error: "Ungültige Art" }, { status: 400 });
    }
  }

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Re-validate temporal ordering when startTime is changed on a VERSCHLUSS/OEFFNEN entry
      if (startTime && (existing.type === "VERSCHLUSS" || existing.type === "OEFFNEN")) {
        const newTime = new Date(startTime);
        if (newTime > new Date()) throw Object.assign(new Error(), { _code: "FUTURE" });
        const allVO = await tx.entry.findMany({
          where: { userId: existing.userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] }, id: { not: id } },
          orderBy: { startTime: "asc" },
          select: { type: true, startTime: true },
        });
        const insertIdx = allVO.findIndex(e => e.startTime > newTime);
        const prev = insertIdx === -1 ? allVO[allVO.length - 1] : allVO[insertIdx - 1];
        const next = insertIdx === -1 ? null : allVO[insertIdx];
        if ((prev && prev.type === existing.type) || (next && next.type === existing.type)) {
          throw Object.assign(new Error(), { _code: "INVALID_ORDER" });
        }
      }

      return tx.entry.update({
        where: { id },
        data: {
          ...(startTime && { startTime: new Date(startTime) }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(imageExifTime !== undefined && {
            imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          }),
          ...(note !== undefined && { note }),
          ...(oeffnenGrund !== undefined && { oeffnenGrund }),
          ...(orgasmusArt !== undefined && { orgasmusArt }),
          ...(kontrollCode !== undefined && { kontrollCode }),
          // verifikationStatus only settable by admins
          ...(verifikationStatus !== undefined && session.user.role === "admin" && { verifikationStatus }),
        },
      });
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "FUTURE") return NextResponse.json({ error: "Zeitpunkt darf nicht in der Zukunft liegen" }, { status: 400 });
    if (code === "INVALID_ORDER") return NextResponse.json({ error: "Zeitpunkt verletzt die chronologische Reihenfolge" }, { status: 400 });
    throw e;
  }

  return NextResponse.json(entry);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.entry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Atomares Unlink + Delete in einer Transaktion
  await prisma.$transaction(async (tx) => {
    if (existing.type === "PRUEFUNG") {
      await tx.kontrollAnforderung.updateMany({
        where: { entryId: id },
        data: { entryId: null, fulfilledAt: null },
      });
    }
    await tx.entry.delete({ where: { id } });
  });

  return new NextResponse(null, { status: 204 });
}
