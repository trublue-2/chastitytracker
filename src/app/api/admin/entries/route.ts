import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor } from "@/lib/authGuards";
import { validateEntryPayload, DEVICE_BEARING_TYPES } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes } from "@/lib/reasonsService";
import { validateDeviceOwnership, releaseSperrzeitenOnOpen, prepareWearEntry, getKgNeighbors } from "@/lib/queries";
import { entryGuardError, entryGuardCode } from "@/lib/entryErrors";
import { isDevBypassEnabled } from "@/lib/devMode";
import { applyEntryFulfilment } from "@/lib/entryFulfilment";
import { notifyControllersAboutEntry } from "@/lib/entryNotify";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId } = body;

  if (!userId) return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400 });

  const session = await requireKeyholderOrAdminActor(userId);
  if (session instanceof NextResponse) return session;

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
  // In der Transaktion ermittelt, nach dem Commit für Meldung bzw. Ahndung wiederverwendet.
  let brokeSperrzeit = false;
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
          brokeSperrzeit = await releaseSperrzeitenOnOpen(userId, oeffnenGrund, tx, "user", user);
        }
      }

      const entryTime = new Date(startTime);
      const created = await tx.entry.create({
        data: {
          userId,
          type,
          startTime: entryTime,
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

      // Was dieser Eintrag abhakt — dieselbe Logik wie auf dem Sub-Pfad (entryFulfilment.ts), mit
      // zwei bewussten Unterschieden:
      //
      // 1. `at = entryTime` statt der Server-Uhr: hier darf rückdatiert werden, und dann ist der
      //    Moment des Erfassens der falsche Bezug — ein nachgetragener pünktlicher Verschluss
      //    gälte sonst als „zu spät". Ausnahme: erfasst jemand für SICH SELBST (ein Nutzer mit
      //    Admin-Rolle, der auch getrackt wird), zählt die Server-Uhr — sonst könnte er eine
      //    eigene Verfehlung durch einen passend datierten Nachtrag auslöschen.
      // 2. KEINE Kontroll-Anforderung (`verification: null`): eine vom Keyholder nachgetragene
      //    Prüfung erfüllt bewusst keine — das tut nur die Einreichung des Subs. Bleibt sie offen
      //    und läuft ab, ist der Rückzug der Anforderung das vorgesehene Mittel, nicht ein
      //    Eintrag ohne eingereichten Nachweis.
      const fulfilAt = userId === session.user.id ? new Date() : entryTime;
      // Rückgabe (die geforderten Geräte) bleibt ungenutzt — siehe unten, warum dieser Pfad nicht
      // automatisch ahndet.
      await applyEntryFulfilment(tx, created, { verification: null, targetWhere: null }, fulfilAt);

      return created;
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: entryGuardCode(e) }, { status: 400 });
  }

  // KEINE automatische Falsch-Gerät-Ahndung auf diesem Pfad — bewusst, anders als beim Sub. Das
  // Keyholder-Formular zeigt nicht an, welches Gerät die Anforderung verlangt, und wählt es nicht
  // vor (`anforderungDeviceId` gibt es nur im Sub-Formular). Ein leer gelassenes Feld trüge dem SUB
  // eine bereits abgeurteilte Strafe ein, die im Urteilsloop nie auftaucht — er würde für einen
  // Tippfehler seiner Keyholderin bestraft. Sie sieht das Gerät am Eintrag und urteilt selbst.

  // Meldung an die Kontrolleure des Subs. Bis hierher fehlte sie auf diesem Pfad ganz: ein von der
  // Keyholderin erfasster Eintrag löste weder Mail noch Push aus (Vorfall 03.08.2026). Sie selbst
  // ist NICHT Empfängerin — sie hat den Eintrag gerade getippt.
  void notifyControllersAboutEntry({
    userId,
    actorUserId: session.user.id,
    username: user.username,
    type,
    startTime: entry.startTime,
    withdrawnSperrzeit: brokeSperrzeit,
    oeffnenGrund: entry.oeffnenGrund,
    orgasmusArt: entry.orgasmusArt,
    kontrollCode: entry.kontrollCode,
    note: entry.note,
    imageUrl: entry.imageUrl,
    deviceId: entry.deviceId,
    reasonConfig: user,
  });

  return NextResponse.json(entry, { status: 201 });
}
