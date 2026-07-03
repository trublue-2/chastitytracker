import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { validateEntryPayload } from "@/lib/constants";
import { validOrgasmusCodes, validOeffnenCodes } from "@/lib/reasonsService";
import { validateDeviceOwnership, releaseSperrzeitenOnOpen, prepareWearEntry } from "@/lib/queries";
import { isDevBypassEnabled } from "@/lib/devMode";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const err = await requireKeyholderOrAdminApi(userId);
  if (err) return err;

  // Ziel-User (= Entry-Eigentümer) laden — dessen Reason-Listen governieren die Validierung.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });

  const devBypass = isDevBypassEnabled(req.headers.get("host"));
  const validationError = validateEntryPayload(body, { requirePhotoForPruefung: false, allowFuture: devBypass }, {
    orgasmCodes: validOrgasmusCodes(user.orgasmusArtenConfig),
    openingCodes: validOeffnenCodes(user.oeffnenGruendeConfig),
  });
  if (validationError) return NextResponse.json({ error: validationError.error }, { status: validationError.status });

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Validate deviceId ownership inside transaction to avoid TOCTOU
      if (deviceId && (type === "VERSCHLUSS" || type === "WEAR_BEGIN" || type === "WEAR_END")) {
        const device = await validateDeviceOwnership(deviceId, userId, tx);
        if (!device) throw Object.assign(new Error(), { _code: "INVALID_DEVICE" });
      }

      // WEAR_BEGIN / WEAR_END: shared validation lives in lib/queries.ts (single source of truth).
      if (type === "WEAR_BEGIN" || type === "WEAR_END") {
        const wearResult = await prepareWearEntry(tx, userId, type, deviceId, startTime, imageUrl);
        if (!wearResult.ok) throw Object.assign(new Error(), { _code: wearResult.code });
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
          deviceId: (type === "VERSCHLUSS" || type === "WEAR_BEGIN" || type === "WEAR_END") ? (deviceId || null) : null,
        },
      });
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "INVALID_DEVICE") return NextResponse.json({ error: "Ungültiges Gerät" }, { status: 400 });
    if (code === "ALREADY_LOCKED") return NextResponse.json({ error: "Verschluss nur möglich wenn aktuell offen" }, { status: 400 });
    if (code === "NOT_LOCKED") return NextResponse.json({ error: "Öffnen nur möglich wenn aktuell verschlossen" }, { status: 400 });
    if (code === "WEAR_DEVICE_REQUIRED") return NextResponse.json({ error: "Gerät ist erforderlich" }, { status: 400 });
    if (code === "WEAR_DEVICE_NO_CATEGORY") return NextResponse.json({ error: "Gerät hat keine Kategorie" }, { status: 400 });
    if (code === "WEAR_DEVICE_KG") return NextResponse.json({ error: "KG-Geräte verwenden Verschluss/Öffnen, nicht WEAR_BEGIN/END" }, { status: 400 });
    if (code === "ALREADY_WEARING") return NextResponse.json({ error: "Bereits aktive Session in dieser Kategorie" }, { status: 400 });
    if (code === "NOT_WEARING") return NextResponse.json({ error: "Keine aktive Session in dieser Kategorie" }, { status: 400 });
    if (code === "WEAR_PHOTO_REQUIRED") return NextResponse.json({ error: "Foto ist bei dieser Kategorie zwingend" }, { status: 400 });
    throw e;
  }

  return NextResponse.json(entry, { status: 201 });
}
