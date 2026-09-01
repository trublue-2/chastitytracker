import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { detectKeyInBox } from "@/lib/verifyCode";
import { deriveSealCode, inspectionCodeRequired, plannedVerification, initialVerificationStatus, type InspectionVerification } from "@/lib/kontrolleService";
import { DEVICE_BEARING_TYPES, validateEntryPayload, VALID_ROTATIONS, BOX_PHOTO_TYPES, parseOrgasmusArtBase, type Rotation } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes } from "@/lib/reasonsService";
import { isDevBypassEnabled } from "@/lib/devMode";
import { validateDeviceOwnership, releaseLockPeriodsOnOpen, prepareWearEntry, openLockRequestWhere, LOCK_REQUEST_ORDER, aktiveKontrolleWhere, getLatestKgEntry } from "@/lib/queries";
import { resolveInspectionTarget, isKgTarget, inspectionTargetWhere } from "@/lib/inspectionTarget";
import { entryGuardError, entryGuardCode } from "@/lib/entryErrors";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { setBoxCommandForUser, boxCommandForEntry } from "@/lib/boxCommand";
import { notifyHeimdall } from "@/lib/heimdallNotify";
import { deviceCheckApplies, runDeviceCheck } from "@/lib/deviceCheckService";
import { lockPeriodEndFromRequest } from "@/lib/verschlussAnforderungService";
import { runInspectionVerification } from "@/lib/inspectionVerificationService";
import { structuredLog } from "@/lib/serverLog";
import { applyEntryFulfilment, applyEntryAftermath } from "@/lib/entryFulfilment";
import { lockAwaitsBolt, findPendingLockTx } from "@/lib/lockCommit";
import { boltFieldsFor } from "@/lib/lockPending";

export async function GET() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "desc" },
    select: {
      id: true, type: true, startTime: true, imageUrl: true, note: true,
      orgasmusArt: true, kontrollCode: true, oeffnenGrund: true, verifikationStatus: true,
      deviceId: true,
    },
    take: 200,
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  // verifikationStatus is never accepted from client – set server-side only
  const { type, startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, deviceId, imageRotation, codeImageUrl, codeReadable, keyInBox, boxImageUrl, boxImageRotation, clientRequestId } = body;

  const devBypass = isDevBypassEnabled(req.headers.get("host"));
  // Reason-Codes gegen die (ggf. angepasste) Liste DES SESSION-USERS validieren; null-Config → Built-ins.
  const reasonUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgasmusArtenConfig: true, oeffnenGruendeConfig: true },
  });
  const validationError = validateEntryPayload(body, { allowFuture: devBypass }, {
    orgasmAllowed: (v) => orgasmusValueAllowed(v, reasonUser?.orgasmusArtenConfig),
    openingCodes: validOeffnenCodes(reasonUser?.oeffnenGruendeConfig),
  });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  // EINE Normalisierung für Persistenz UND Box-Kommando — sonst könnte die Box einem Wert folgen, den
  // der Eintrag nicht dokumentiert. Nicht-Boolean ist oben ausgeschlossen; bleibt: fehlt = null.
  const keyInBoxDeclared: boolean | null = keyInBox ?? null;

  // Dieselbe Normalisierung für Prüfung UND Persistenz. Zweimal hingeschrieben könnte die Prüfung
  // einen Wert nachschlagen, den die Zeile gar nicht speichert.
  const requestKey: string | null = typeof clientRequestId === "string" && clientRequestId ? clientRequestId : null;

  // Derselbe Versuch, ein zweites Mal? Dann den vorhandenen Eintrag zurückgeben statt einen neuen
  // anzulegen. Wozu der Stempel da ist, steht bei `entryRequest()`.
  //
  // Antwort ohne 201: angelegt wurde in DIESEM Aufruf nichts. Der Client sieht trotzdem Erfolg, und
  // das ist richtig — sein Wunsch ist erfüllt, nur eben beim ersten Versuch.
  if (requestKey) {
    const schonDa = await prisma.entry.findFirst({ where: { clientRequestId: requestKey, userId: session.user.id } });
    if (schonDa) return NextResponse.json(schonDa);
  }

  // Replay-Schutz fürs Box-Foto: dieselbe Aufnahme darf nicht ein zweites Mal als Nachweis dienen.
  // Ohne diese Prüfung könnte der Sub die URL seines ersten Fotos aus dem Request-Body abschreiben
  // und bei jeder Kontrolle erneut schicken — der Nachweis „der Schlüssel liegt NOCH drin" wäre
  // dann eine Momentaufnahme von vor Wochen. Das Haupt-Foto ist über die EXIF-Zeit gedeckt, das
  // Box-Foto hat keine; hier ist die Eindeutigkeit der Datei die Deckung.
  if (BOX_PHOTO_TYPES.has(type) && boxImageUrl) {
    const reused = await prisma.entry.findFirst({ where: { boxImageUrl }, select: { id: true } });
    if (reused) return NextResponse.json({ error: "BOX_PHOTO_REUSED" }, { status: 400 });
  }

  // Wrap state-check + create in a transaction to prevent TOCTOU races
  let entry: Awaited<ReturnType<typeof prisma.entry.create>>;
  // In der Transaktion entschieden, ausserhalb für den Instant-Push wiederverwendet.
  let boxCmd: "lock" | "open" | null = null;

  let withdrawnLockPeriod = false;
  let lockStartTime: Date | null = null;
  // Schliesst dieser VERSCHLUSS eine Reinigungspause ab? In der Transaktion aus demselben
  // Lock-Eintrag abgeleitet, den der Guard ohnehin liest — nach dem Commit löst er die Kontrolle aus.
  let endsCleaningPause = false;
  // Wartet dieser Verschluss auf den Riegel? Dann ist er nur der AUFRUF: geschrieben, aber für
  // jede Ableitung unsichtbar, bis die Box meldet (`lockCommit.ts`, docs/riegel-konzept.md).
  // In der Transaktion entschieden, danach für die übersprungenen Nacharbeiten gebraucht.
  let awaitsBolt = false;
  let requiredAnforderungDeviceIds: string[] = [];
  // In der Transaktion abgeleitet (braucht den Lock-Eintrag), NACH dem Commit für die eigentliche
  // Prüfung wiederverwendet — deshalb hier draussen. null = keine PRUEFUNG mit Foto.
  let verification: InspectionVerification | null = null;
  // Das Gerät, das im Kontroll-Foto zu sehen sein sollte — beim KG das verschlossene, bei einer
  // Trage-Kontrolle das gezeigte. Aus derselben Ziel-Auflösung wie `verification`, damit
  // Code-Prüfung und Geräte-Check dasselbe Ziel meinen.
  let inspectionExpectedDeviceId: string | null = null;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Validate deviceId ownership inside transaction (VERSCHLUSS / WEAR_*)
      if (deviceId && DEVICE_BEARING_TYPES.includes(type)) {
        const device = await validateDeviceOwnership(deviceId, session.user.id, tx);
        if (!device) throw entryGuardError("INVALID_DEVICE");
      }

      // WEAR_BEGIN / WEAR_END: shared validation lives in lib/queries.ts (single source of truth).
      if (type === "WEAR_BEGIN" || type === "WEAR_END") {
        const wearResult = await prepareWearEntry(tx, session.user.id, type, deviceId, startTime, imageUrl);
        if (!wearResult.ok) throw entryGuardError(wearResult.code);
      }

      // tx durchreichen: der Read-then-Write-Guard muss in DERSELBEN Transaktion lesen (TOCTOU).
      if (type === "VERSCHLUSS") {
        const latest = await getLatestKgEntry(session.user.id, tx);
        if (latest?.type === "VERSCHLUSS") throw entryGuardError("ALREADY_LOCKED");
        // Ein schwebender Aufruf zählt für `getLatestKgEntry` bewusst nicht als Verschluss — der
        // Guard oben greift für ihn also nicht, und ohne den hier legte der Träger beliebig viele
        // Aufrufe übereinander an, während die Box auf den ersten wartet.
        if (await findPendingLockTx(tx, session.user.id)) throw entryGuardError("LOCK_ALREADY_PENDING");
        if (latest?.type === "OEFFNEN" && new Date(startTime) <= latest.startTime) {
          throw entryGuardError("TIME_BEFORE");
        }
        endsCleaningPause = latest?.type === "OEFFNEN" && latest.oeffnenGrund === "REINIGUNG";
        awaitsBolt = await lockAwaitsBolt(tx, session.user.id, keyInBoxDeclared, new Date());
      }
      if (type === "OEFFNEN") {
        const latest = await getLatestKgEntry(session.user.id, tx);
        if (!latest || latest.type !== "VERSCHLUSS") throw entryGuardError("NOT_LOCKED");
        if (new Date(startTime) <= latest.startTime) throw entryGuardError("TIME_BEFORE");
        lockStartTime = latest.startTime;
      }

      if (type === "OEFFNEN") {
        withdrawnLockPeriod = await releaseLockPeriodsOnOpen(session.user.id, oeffnenGrund, tx, "user");
      }

      // WELCHES ZIEL beantwortet diese Einreichung? Ohne Gerät der KG (Bestandsverhalten), mit
      // einem Gerät einer Trage-Kategorie deren Kontrolle. Dieselbe Auflösung wie beim Anlegen der
      // Anforderung — sonst könnte eine Kontrolle auf ein Ziel zeigen, das die Erfüllung anders liest.
      const resolvedTarget = type === "PRUEFUNG" && imageUrl
        ? await resolveInspectionTarget(session.user.id, { deviceId: deviceId || null }, tx)
        : null;
      if (resolvedTarget && !resolvedTarget.ok) throw entryGuardError("INVALID_DEVICE");
      const inspectionTarget = resolvedTarget?.ok ? resolvedTarget.target : null;
      // Das Gerät, an dem die Code-Pflicht hängt: bei einer Trage-Kontrolle das GEZEIGTE (es steht
      // im Foto), beim KG das verschlossene (das Foto zeigt das Siegel, nicht zwingend das Gerät).
      const submissionDeviceId = inspectionTarget && !isKgTarget(inspectionTarget)
        ? inspectionTarget.deviceId
        : inspectionTarget?.activeDeviceId ?? null;
      // Der GERÄTE-CHECK bekommt das Gerät nur beim KG-Ziel. `gatherDeviceReferences` sammelt
      // ausschliesslich Geräte der eingebauten Kategorie, und der Vision-Prompt fragt nach einem
      // Keuschheitsgürtel — für ein Trage-Gerät fände `checkDeviceInPhoto` keine Referenz und
      // meldete „nicht prüfbar" (error) an JEDER Trage-Kontrolle. Ohne Gerät läuft der Check gar
      // nicht und die Zeile endet auf `null` = „nicht geprüft", was der Wahrheit entspricht.
      // Trage-Ziele hier mitzuprüfen ist ein eigenes Stück Arbeit (Referenzen + Prompt je Kategorie).
      inspectionExpectedDeviceId = inspectionTarget && isKgTarget(inspectionTarget)
        ? inspectionTarget.activeDeviceId
        : null;
      // Was an dieser Einreichung zu prüfen ist — EINE Ableitung für den Startwert unten, für die
      // Prüfung nach dem Commit und für die Art der Erfüllung. Die Siegel-Nummer kommt aus dem
      // Lock-Eintrag, den nur das KG-Ziel mitbringt (`lockEntry`); eine Trage-Kontrolle hat keine.
      verification = inspectionTarget
        ? plannedVerification({
            submittedCode: kontrollCode,
            codeRequired: await inspectionCodeRequired(submissionDeviceId, tx),
            sealCode: deriveSealCode(inspectionTarget.lockEntry),
          })
        : null;
      // "pending" nur, wenn danach wirklich eine Prüfung läuft, die es ersetzt (siehe unten);
      // "not_required", wenn das Gerät gar keinen Code verlangt und kein Siegel aktiv ist.
      const initialVerifikationStatus = verification ? initialVerificationStatus(verification) : null;
      // Dasselbe für den Geräte-Check, der ebenfalls erst nach dem Commit läuft. Die Bedingung kommt
      // aus deviceCheckService — derselbe Ausdruck entscheidet unten, ob der Lauf gestartet wird, der
      // dieses "pending" wieder abräumen MUSS. Zwei getrennt hingeschriebene Bedingungen könnten
      // auseinanderlaufen und die Zeile für immer auf "pending" stehen lassen.
      const initialDeviceCheck = deviceCheckApplies(type, imageUrl) ? "pending" : null;

      const created = await tx.entry.create({
        data: {
          userId: session.user.id,
          // Der Stempel wandert MIT in die Zeile — er ist der einzige Grund, warum der zweite
          // Versuch oben als derselbe erkannt wird.
          clientRequestId: requestKey,
          type,
          startTime: new Date(startTime),
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          note: note || null,
          oeffnenGrund: oeffnenGrund || null,
          orgasmusArt: orgasmusArt || null,
          kontrollCode: kontrollCode || null,
          verifikationStatus: initialVerifikationStatus,
          deviceCheck: initialDeviceCheck,
          // PRUEFUNG trägt seit v5.0.1 ebenfalls ein Gerät: bei einer Trage-Kontrolle ist es das
          // gezeigte und damit das einzige, woran später erkennbar ist, WAS kontrolliert wurde.
          deviceId: DEVICE_BEARING_TYPES.includes(type)
            ? (deviceId || null)
            : null,
          // Bildersafe: versiegeltes Schlüsselbox-Code-Foto (nur VERSCHLUSS)
          codeImageUrl: type === "VERSCHLUSS" ? (codeImageUrl || null) : null,
          codeReadable: type === "VERSCHLUSS" && codeImageUrl ? (codeReadable ?? null) : null,
          keyInBox: type === "VERSCHLUSS" ? keyInBoxDeclared : null,
          // Der Verschluss gilt sofort — ausser er wartet auf den Riegel. Die Regel steht in
          // `lockPending.ts`, weil JEDER Erzeuger eines VERSCHLUSS sie braucht.
          ...boltFieldsFor(type, new Date(startTime), awaitsBolt),
          // `keyDetected` bleibt hier ungesetzt (null) — das Urteil fällt nach dem Commit (siehe unten).
          boxImageUrl: BOX_PHOTO_TYPES.has(type) ? (boxImageUrl || null) : null,
        },
      });

      // KontrollAnforderung verknüpfen + fulfilledAt server-seitig setzen (unveränderlich).
      // Nur bereits AUSGELÖSTE Anforderungen (wirksamAb erreicht) — sonst könnte ein zufällig
      // kollidierender Selbstkontroll-Code eine noch unsichtbare, geplante Auto-Kontrolle erfüllen.
      //
      // ZWEI Zuordnungswege, und der Unterschied ist der Kern des Geräte-Toggles:
      //
      // 1. Mit Code-Pflicht ist der Code der SCHLÜSSEL — er sagt, WELCHE Anforderung dieses Foto
      //    beantwortet. Ohne passenden Code wird nichts erfüllt; eine freiwillige Selbstkontrolle
      //    lässt eine offene Anforderung also unberührt.
      // 2. Ohne Code-Pflicht gibt es keinen Schlüssel. Dann beantwortet das Foto die EINE offene
      //    Anforderung — es gibt nie mehr als eine (requestKontrolle lehnt eine zweite mit
      //    INSPECTION_ALREADY_ACTIVE ab, der Poller zieht überschneidende Auto-Kontrollen zurück).
      //    Damit erfüllt hier auch eine freiwillig erfasste Kontrolle die offene Anforderung — das
      //    ist gewollt: ohne Code ist eine „freiwillige" von einer „beantworteten" nicht mehr zu
      //    unterscheiden, und die Einreichung ist da.
      //
      // `orderBy deadline asc` + `take 1` statt updateMany: sollte der Überschneidungs-Schutz doch
      // einmal zwei Zeilen durchlassen (er ist ein Best-Effort-Read-then-Write, siehe
      // requestKontrolle), erfüllt ein Foto genau EINE — die dringendste — statt beide auf einmal.
      // Was dieser Eintrag abhakt (Kontrolle, Verschluss-Anforderungen samt Sperrzeiten,
      // Orgasmus-Anforderung) — dieselbe Logik wie auf dem Keyholder-Pfad, siehe
      // entryFulfilment.ts. `at = new Date()`: die SERVER-Uhr, nie die frei wählbare Eintrags-Zeit
      // (sonst datierte sich jeder Sub aus jeder Frist heraus). Die Ziel-Schranke reist mit, damit
      // ein Plug-Foto keine KG-Kontrolle abhakt.
      //
      // Ein schwebender Aufruf hakt NICHTS ab: eine Verschluss-Anforderung ist mit dem Riegel
      // erfüllt, nicht mit dem Aufruf. Das holt `commitPendingLock` nach, sobald die Box meldet.
      requiredAnforderungDeviceIds = awaitsBolt ? [] : await applyEntryFulfilment(
        tx,
        created,
        {
          verification,
          targetWhere: inspectionTarget ? inspectionTargetWhere(inspectionTarget, submissionDeviceId) : null,
        },
        new Date(),
      );

      // Box-Kopplung: die Heimdall-Box folgt dem Eintrag. Die Regel — samt der zwei Fälle, in denen
      // sie ihm NICHT folgt — steht in `boxCommandForEntry`. No-op ohne Heimdall/Box.
      boxCmd = boxCommandForEntry({ type, keyInBox: keyInBoxDeclared, brokeLockPeriod: withdrawnLockPeriod });
      if (boxCmd) await setBoxCommandForUser(tx, session.user.id, boxCmd);

      return created;
    });
  } catch (e: unknown) {
    // Zwei gleiche Versuche GLEICHZEITIG: die Vorabprüfung oben sieht beide leer, beide schreiben,
    // der zweite läuft in den Index. Real, seit der Client abbricht — die erste Anfrage läuft
    // serverseitig weiter, während die Warteschlange dieselbe schon nachschickt.
    //
    // Ohne diesen Zweig käme ein P2002 im generischen `entryGuardCode(e)` an, das für ihn
    // `undefined` liefert: eine 400-Antwort mit leerem Fehlerfeld für einen Eintrag, der in
    // Wahrheit angelegt wurde.
    if (requestKey && isUniqueConstraintOn(e, "clientRequestId")) {
      const schonDa = await prisma.entry.findFirst({ where: { clientRequestId: requestKey, userId: session.user.id } });
      if (schonDa) return NextResponse.json(schonDa);
    }
    return NextResponse.json({ error: entryGuardCode(e) }, { status: 400 });
  }

  // Instant-Push an Heimdall: eine LIVE Box vollzieht dasselbe Kommando sofort per MQTT — der
  // pendingCommand-Pull beim nächsten Box-Sync (in der Transaktion oben gesetzt) bleibt der Fallback.
  // Dieselbe Entscheidung, nicht dieselbe Bedingung noch einmal: sonst driften Pull und Push
  // auseinander und die Box täte per MQTT etwas anderes als beim Sync. No-op ohne HEIMDALL_BASE_URL.
  if (boxCmd) notifyHeimdall(session.user.name, boxCmd);

  // REINIGUNG-Limit wird NICHT mehr automatisch bestraft: eine Reinigungsöffnung über dem
  // Tageskontingent (auch ein Geräte-Wechsel) wird im Strafbuch nur noch ERKANNT (live in
  // buildStrafbuch abgeleitet); ob sie geahndet wird, entscheidet die Keyholderin. Das
  // Öffnen-Formular warnt weiterhin vorab — forcedReinigung bleibt rein informativ.

  // Was einem wirksamen Eintrag FOLGT: automatische Ahndung eines falschen Geräts, Aktivitäts-
  // Stempel, die Kontrolle nach einer Reinigungspause („zeig mir, dass du wieder drin bist") und
  // die Meldung an die Keyholder in DEREN Sprache (Issue #43). Die vier Schritte stehen in
  // `applyEntryAftermath` (entryFulfilment.ts), weil der VERZÖGERTE Vollzug (`commitPendingLock`)
  // exakt dieselben braucht — und ein fünfter sonst an einer der beiden Stellen fehlte.
  //
  // `awaitsBolt` schaltet genau die zwei Schritte ab, die eine vollzogene Tat behaupten: wieder DRIN
  // ist der Träger erst mit dem Riegel, und „hat sich eingeschlossen" wäre bis dahin eine Behauptung
  // über etwas, das noch nicht passiert ist. Beides holt der Vollzug nach.
  await applyEntryAftermath(entry, {
    requiredDeviceIds: requiredAnforderungDeviceIds,
    endsCleaningPause: endsCleaningPause && !awaitsBolt,
    awaitsBolt,
    notify: awaitsBolt ? null : {
      actorUserId: session.user.id,
      userId: session.user.id,
      username: session.user.name ?? "User",
      type,
      startTime: new Date(startTime),
      withdrawnLockPeriod,
      oeffnenGrund,
      orgasmusArt,
      kontrollCode,
      note,
      imageUrl,
      keyInBoxDeclared,
      lockStartTime,
      deviceId,
      reasonConfig: reasonUser,
    },
  });

  // Kontroll-Geräte-Check (advisory): ist das erwartete Gerät im Kontroll-Foto sichtbar? Welches das
  // ist, steht schon fest — die Ziel-Auflösung in der Transaktion hat es bestimmt, dieselbe Quelle
  // wie für die Code-Prüfung. Server-seitig + fire-and-forget (blockiert die Antwort NICHT);
  // Ergebnis landet als entry.deviceCheck, das der Keyholder sieht. Der Vorgang (inkl. der Pflicht,
  // das oben gesetzte "pending" IMMER durch einen Endzustand zu ersetzen) liegt in
  // deviceCheckService — hier steht nur der Start.
  if (deviceCheckApplies(type, imageUrl)) {
    void runDeviceCheck({
      entryId: entry.id,
      userId: session.user.id,
      photoUrl: imageUrl!,
      expectedDeviceId: inspectionExpectedDeviceId,
    });
  }

  // Foto-Verifikation (Code bzw. nur Siegel) — der Vorgang inkl. der Pflicht, das oben gesetzte
  // "pending" durch einen Endzustand zu ersetzen, liegt in inspectionVerificationService. Hier steht
  // nur der Start, und `verification` ist derselbe Wert, der oben den Startwert bestimmt hat.
  if (verification && imageUrl) {
    void runInspectionVerification({
      entryId: entry.id,
      userId: session.user.id,
      photoUrl: imageUrl,
      // Die Foto-Drehung des Nutzers respektieren — sonst scheitert die Server-Prüfung an einem
      // gedrehten Bild, das in der Client-Vorschau gematcht hat.
      rotation: VALID_ROTATIONS.includes(imageRotation) ? imageRotation : 0,
      verification,
    });
  }

  // Schlüssel-Erkennung auf dem Box-Foto — wie die Code-Verifikation server-seitig und
  // fire-and-forget. Der Client schickt NUR das Foto, nie das Urteil: ein Nachweis, den der
  // Nachzuweisende selbst formuliert, ist keiner.
  //
  // Anders als bei `verifikationStatus` muss hier NICHT immer zurückgeschrieben werden: die Spalte
  // startet auf null und `null` heisst genau dasselbe wie ihr Startwert („nicht geprüft"). Es gibt
  // also keinen „pending"-Zustand, in dem ein Eintrag hängenbleiben könnte.
  if (BOX_PHOTO_TYPES.has(type) && boxImageUrl) {
    const entryId = entry.id;
    const photoUrl = boxImageUrl;
    const safeRotation: Rotation = VALID_ROTATIONS.includes(boxImageRotation) ? boxImageRotation : 0;
    (async () => {
      const detected = await detectKeyInBox(photoUrl, safeRotation);
      if (detected === null) return;
      try {
        await prisma.entry.update({ where: { id: entryId }, data: { keyDetected: detected } });
      } catch (err) {
        console.error("[POST /api/entries] keyDetected write failed for entry", entryId, err);
      }
    })();
  }

  if (type === "VERSCHLUSS" || type === "OEFFNEN") {
    revalidatePath("/dashboard", "layout");
  }

  return NextResponse.json(entry, { status: 201 });
}
