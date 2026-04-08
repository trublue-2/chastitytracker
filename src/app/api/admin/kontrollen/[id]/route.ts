import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";
import { requireAdminApi } from "@/lib/authGuards";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;

  const { id } = await params;
  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ka.withdrawnAt) return NextResponse.json({ error: "Nur zurückgezogene Kontrollen können gelöscht werden" }, { status: 400 });

  await prisma.kontrollAnforderung.delete({ where: { id } });
  trackEvent("kontrolle.deleted");
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;

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
    trackEvent("kontrolle.withdrawn");
    return NextResponse.json(updated);
  }

  if (action === "manuallyVerify") {
    if (!ka.entryId) return NextResponse.json({ error: "Keine Einreichung vorhanden" }, { status: 400 });
    await prisma.entry.update({
      where: { id: ka.entryId },
      data: { verifikationStatus: "manual" },
    });
    trackEvent("kontrolle.verified");
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (!ka.entryId) return NextResponse.json({ error: "Keine Einreichung vorhanden" }, { status: 400 });
    await prisma.entry.update({
      where: { id: ka.entryId },
      data: { verifikationStatus: "rejected" },
    });
    trackEvent("kontrolle.rejected");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
