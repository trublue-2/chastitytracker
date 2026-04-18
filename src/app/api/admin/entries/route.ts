import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";
import { validateEntryPayload } from "@/lib/constants";
import { validateDeviceOwnership, releaseSperrzeitenOnOpen } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const body = await req.json();
  const { userId, type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const validationError = validateEntryPayload(body, { requirePhotoForPruefung: false });
  if (validationError) return NextResponse.json({ error: validationError.error }, { status: validationError.status });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Validate deviceId ownership inside transaction to avoid TOCTOU
      if (deviceId && type === "VERSCHLUSS") {
        const device = await validateDeviceOwnership(deviceId, userId, tx);
        if (!device) throw Object.assign(new Error(), { _code: "INVALID_DEVICE" });
      }

      if (type === "VERSCHLUSS") {
        const latest = await tx.entry.findFirst({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (latest?.type === "VERSCHLUSS") throw Object.assign(new Error(), { _code: "ALREADY_LOCKED" });
      }

      if (type === "OEFFNEN") {
        const latest = await tx.entry.findFirst({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (!latest || latest.type !== "VERSCHLUSS") throw Object.assign(new Error(), { _code: "NOT_LOCKED" });
        // Admin-opened entries must release the lock period too, otherwise the
        // user still appears locked. Reinigung-erlaubt-Flag aus vorab geladenem User.
        await releaseSperrzeitenOnOpen(userId, oeffnenGrund, tx, user.reinigungErlaubt);
      }

      return tx.entry.create({
        data: {
          userId,
          type,
          startTime: new Date(startTime),
          note: note?.trim() || null,
          oeffnenGrund: oeffnenGrund || null,
          orgasmusArt: orgasmusArt || null,
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          kontrollCode: kontrollCode || null,
          deviceId: type === "VERSCHLUSS" ? (deviceId || null) : null,
        },
      });
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "INVALID_DEVICE") return NextResponse.json({ error: "Ungültiges Gerät" }, { status: 400 });
    if (code === "ALREADY_LOCKED") return NextResponse.json({ error: "Verschluss nur möglich wenn aktuell offen" }, { status: 400 });
    if (code === "NOT_LOCKED") return NextResponse.json({ error: "Öffnen nur möglich wenn aktuell verschlossen" }, { status: 400 });
    throw e;
  }

  return NextResponse.json(entry, { status: 201 });
}
