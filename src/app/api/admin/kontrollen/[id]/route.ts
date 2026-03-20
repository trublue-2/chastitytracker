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
    if (ka.manuallyVerifiedAt) return NextResponse.json({ error: "Bereits manuell verifiziert" }, { status: 400 });
    const now = new Date();
    const updated = await prisma.kontrollAnforderung.update({
      where: { id },
      data: { manuallyVerifiedAt: now, fulfilledAt: ka.fulfilledAt ?? now, rejectedAt: null },
    });
    return NextResponse.json(updated);
  }

  if (action === "reject") {
    if (ka.rejectedAt) return NextResponse.json({ error: "Bereits abgelehnt" }, { status: 400 });
    const updated = await prisma.kontrollAnforderung.update({
      where: { id },
      data: { rejectedAt: new Date(), manuallyVerifiedAt: null },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
