import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = await req.json();

  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "withdraw") {
    if (ka.withdrawnAt) return NextResponse.json({ error: "Bereits zurückgezogen" }, { status: 400 });
    const updated = await prisma.kontrollAnforderung.update({
      where: { id },
      data: { withdrawnAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  if (action === "manuallyVerify") {
    if (!ka.entryId) return NextResponse.json({ error: "Keine Einreichung vorhanden" }, { status: 400 });
    await prisma.entry.update({
      where: { id: ka.entryId },
      data: { verifikationStatus: "manual" },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (!ka.entryId) return NextResponse.json({ error: "Keine Einreichung vorhanden" }, { status: 400 });
    await prisma.entry.update({
      where: { id: ka.entryId },
      data: { verifikationStatus: "rejected" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
