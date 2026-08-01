import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { validateEntryPayload, DEVICE_BEARING_TYPES } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes } from "@/lib/reasonsService";
import { validateDeviceOwnership, releaseSperrzeitenOnOpen, prepareWearEntry, getKgNeighbors } from "@/lib/queries";
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
      if (deviceId && DEVICE_BEARING_TYPES.includes(type)) {
        const device = await validateDeviceOwnership(deviceId, userId, tx);
        if (!device) throw entryGuardError("INVALID_DEVICE");
      }

      // WEAR_BEGIN / WEAR_END: shared validation lives in lib/queries.ts (single source of truth).
      if (type === "WEAR_BEGIN" || type === "WEAR_END") {
        const wearResult = await prepareWearEntry(tx, userId, type, deviceId, startTime, imageUrl);
        if (!wearResult.ok) throw entryGuardError(wearResult.code);
      }

      // tx durchreichen: der Read-then-Write-Guard muss in DERSELBEN Transaktion lesen (TOCTOU).
      // Aus demselben Grund löst ein VERSCHLUSS hier auch KEINE Reinigungs-Kontrolle aus (die
      // steht am Selbst-Erfassungs-Pfad des Subs, siehe `scheduleCleaningRelockInspection`): ein um
      // 23:00 nachgetragener Verschluss von 14:00 würde sonst eine Kontrolle „in 15–45 Minuten"
      // planen — der Planer rechnet ab jetzt, nicht ab `startTime`.
      // Hinweis: die Admin-Route hat bewusst KEINEN TIME_BEFORE-Guard (Backdating ist erlaubt) —
      // der neue Eintrag darf also zeitlich VOR den bisher jüngsten KG-Eintrag rutschen. `prev` ist
      // dabei NICHT dasselbe wie `getLatestKgEntry`: nur ohne Backdating (dem Normalfall) fallen
      // beide zusammen, weshalb ein einziger Nachbar-Query beide Fälle abdeckt — kein zweiter,
      // redundanter Query gegen denselben global-jüngsten Eintrag.
      //
      // `next` fängt die Anomalie, die der reine ALREADY_LOCKED/NOT_LOCKED-Check (gegen `prev`)
      // nicht sieht: der neue Eintrag landet zwischen einem bestehenden Paar und erzeugt zwei
      // gleichartige KG-Einträge (VERSCHLUSS/VERSCHLUSS oder OEFFNEN/OEFFNEN) hintereinander.
      if (type === "VERSCHLUSS" || type === "OEFFNEN") {
        const { prev, next } = await getKgNeighbors(userId, new Date(startTime), tx);
        if (next && next.type === type) throw entryGuardError("INVALID_ORDER");

        if (type === "VERSCHLUSS" && prev?.type === "VERSCHLUSS") throw entryGuardError("ALREADY_LOCKED");

        if (type === "OEFFNEN") {
          if (!prev || prev.type !== "VERSCHLUSS") throw entryGuardError("NOT_LOCKED");
          // Admin-opened entries must release the lock period too, otherwise the
          // user still appears locked. Reinigungs-Regeln aus dem vorab geladenen User.
          await releaseSperrzeitenOnOpen(userId, oeffnenGrund, tx, "user", user);
        }
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
          // PRUEFUNG trägt seit v5.0.1 das kontrollierte Gerät (Trage-Kontrollen) — hier nur als
          // Datum am Eintrag: eine vom Keyholder nachgetragene Prüfung erfüllt bewusst keine
          // Anforderung (das tut nur die Einreichung des Subs, siehe /api/entries).
          deviceId: DEVICE_BEARING_TYPES.includes(type)
            ? (deviceId || null)
            : null,
        },
      });
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: entryGuardCode(e) }, { status: 400 });
  }

  return NextResponse.json(entry, { status: 201 });
}
