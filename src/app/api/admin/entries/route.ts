import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { validateEntryPayload } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes } from "@/lib/reasonsService";
import { validateDeviceOwnership, releaseSperrzeitenOnOpen, prepareWearEntry, getLatestKgEntry } from "@/lib/queries";
import { entryGuardError, entryGuardCode } from "@/lib/entryErrors";
import { isDevBypassEnabled } from "@/lib/devMode";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId } = body;

  if (!userId) return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400 });

  const err = await requireKeyholderOrAdminApi(userId);
  if (err) return err;

  // Ziel-User (= Entry-Eigentümer) laden — dessen Reason-Listen governieren die Validierung.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  const devBypass = isDevBypassEnabled(req.headers.get("host"));
  const validationError = validateEntryPayload(body, { requirePhotoForPruefung: false, allowFuture: devBypass }, {
    orgasmAllowed: (v) => orgasmusValueAllowed(v, user.orgasmusArtenConfig),
    openingCodes: validOeffnenCodes(user.oeffnenGruendeConfig),
  });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Validate deviceId ownership inside transaction to avoid TOCTOU
      if (deviceId && (type === "VERSCHLUSS" || type === "WEAR_BEGIN" || type === "WEAR_END")) {
        const device = await validateDeviceOwnership(deviceId, userId, tx);
        if (!device) throw entryGuardError("INVALID_DEVICE");
      }

      // WEAR_BEGIN / WEAR_END: shared validation lives in lib/queries.ts (single source of truth).
      if (type === "WEAR_BEGIN" || type === "WEAR_END") {
        const wearResult = await prepareWearEntry(tx, userId, type, deviceId, startTime, imageUrl);
        if (!wearResult.ok) throw entryGuardError(wearResult.code);
      }

      // tx durchreichen: der Read-then-Write-Guard muss in DERSELBEN Transaktion lesen (TOCTOU).
      // Hinweis: die Admin-Route hat bewusst KEINEN TIME_BEFORE-Guard (Backdating ist erlaubt).
      if (type === "VERSCHLUSS") {
        const latest = await getLatestKgEntry(userId, tx);
        if (latest?.type === "VERSCHLUSS") throw entryGuardError("ALREADY_LOCKED");
      }

      if (type === "OEFFNEN") {
        const latest = await getLatestKgEntry(userId, tx);
        if (!latest || latest.type !== "VERSCHLUSS") throw entryGuardError("NOT_LOCKED");
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
    return NextResponse.json({ error: entryGuardCode(e) }, { status: 400 });
  }

  return NextResponse.json(entry, { status: 201 });
}
