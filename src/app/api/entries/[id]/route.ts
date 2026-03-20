import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const { startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, aiVerified } = body;

  const entry = await prisma.entry.update({
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
      ...(aiVerified !== undefined && { aiVerified: aiVerified !== null ? Boolean(aiVerified) : null }),
    },
  });

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

  await prisma.entry.delete({ where: { id } });

  // Wenn eine Kontrolle gelöscht wird, KontrollAnforderung vollständig zurücksetzen
  if (existing.type === "PRUEFUNG" && existing.kontrollCode) {
    await prisma.kontrollAnforderung.updateMany({
      where: { userId: existing.userId, code: existing.kontrollCode },
      data: { fulfilledAt: null, manuallyVerifiedAt: null, rejectedAt: null },
    });
  }

  return new NextResponse(null, { status: 204 });
}
