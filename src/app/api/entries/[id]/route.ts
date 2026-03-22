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
  const { startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, verifikationStatus } = body;

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
      ...(verifikationStatus !== undefined && { verifikationStatus }),
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

  // Wenn eine Kontrolle gelöscht wird, KontrollAnforderung-Verknüpfung lösen
  if (existing.type === "PRUEFUNG") {
    await prisma.kontrollAnforderung.updateMany({
      where: { entryId: id },
      data: { entryId: null },
    });
  }

  await prisma.entry.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
