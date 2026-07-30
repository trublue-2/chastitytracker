import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { markLastAction } from "@/lib/appMeta";
import { detectKeyInBox } from "@/lib/verifyCode";
import { deriveSealCode, inspectionCodeRequired, plannedVerification, initialVerificationStatus, type InspectionVerification } from "@/lib/kontrolleService";
import { validateEntryPayload, TYPE_EMAIL_COLORS, VALID_ROTATIONS, BOX_PHOTO_TYPES, parseOrgasmusArtBase, type Rotation } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes, effectiveOrgasmusArten, effectiveOeffnenGruende, resolveOrgasmusArtDisplay, resolveReasonLabel } from "@/lib/reasonsService";
import { isDevBypassEnabled } from "@/lib/devMode";
import { validateDeviceOwnership, releaseSperrzeitenOnOpen, prepareWearEntry, activeVerschlussAnforderungWhere, openLockRequestWhere, LOCK_REQUEST_ORDER, aktiveKontrolleWhere, getLatestKgEntry } from "@/lib/queries";
import { entryGuardError, entryGuardCode } from "@/lib/entryErrors";
import { setBoxCommandForUser, boxCommandForEntry } from "@/lib/boxCommand";
import { notifyHeimdall } from "@/lib/heimdallNotify";
import { deviceCheckApplies, runDeviceCheck } from "@/lib/deviceCheckService";
import { runInspectionVerification } from "@/lib/inspectionVerificationService";
import { structuredLog } from "@/lib/serverLog";
import { sendPushToUser } from "@/lib/push";
import { getControllersOfUser } from "@/lib/keyholder";
import { sendMailSafe, escHtml, appBaseUrl } from "@/lib/mail";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

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
  const { type, startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, deviceId, imageRotation, codeImageUrl, codeReadable, keyInBox, boxImageUrl, boxImageRotation } = body;

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

  let withdrawnSperrzeit = false;
  let lockStartTime: Date | null = null;
  let requiredAnforderungDeviceIds: string[] = [];
  // In der Transaktion abgeleitet (braucht den Lock-Eintrag), NACH dem Commit für die eigentliche
  // Prüfung wiederverwendet — deshalb hier draussen. null = keine PRUEFUNG mit Foto.
  let verification: InspectionVerification | null = null;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Validate deviceId ownership inside transaction (VERSCHLUSS / WEAR_*)
      if (deviceId && (type === "VERSCHLUSS" || type === "WEAR_BEGIN" || type === "WEAR_END")) {
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
        if (latest?.type === "OEFFNEN" && new Date(startTime) <= latest.startTime) {
          throw entryGuardError("TIME_BEFORE");
        }
      }
      if (type === "OEFFNEN") {
        const latest = await getLatestKgEntry(session.user.id, tx);
        if (!latest || latest.type !== "VERSCHLUSS") throw entryGuardError("NOT_LOCKED");
        if (new Date(startTime) <= latest.startTime) throw entryGuardError("TIME_BEFORE");
        lockStartTime = latest.startTime;
      }

      if (type === "OEFFNEN") {
        withdrawnSperrzeit = await releaseSperrzeitenOnOpen(session.user.id, oeffnenGrund, tx, "user");
      }

      // Was an dieser Einreichung zu prüfen ist — EINE Ableitung für den Startwert unten, für die
      // Prüfung nach dem Commit und für die Art der Erfüllung. Braucht den Lock-Eintrag (getragenes
      // Gerät + aktives Siegel); für Nicht-PRUEFUNG gibt es nichts zu holen und nichts zu prüfen.
      const lock = type === "PRUEFUNG" && imageUrl ? await getLatestKgEntry(session.user.id, tx) : null;
      const lockedDeviceId = lock?.type === "VERSCHLUSS" ? lock.deviceId : null;
      verification = lock
        ? plannedVerification({
            submittedCode: kontrollCode,
            codeRequired: await inspectionCodeRequired(lockedDeviceId, tx),
            sealCode: deriveSealCode(lock),
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
          deviceId: (type === "VERSCHLUSS" || type === "WEAR_BEGIN" || type === "WEAR_END") ? (deviceId || null) : null,
          // Bildersafe: versiegeltes Schlüsselbox-Code-Foto (nur VERSCHLUSS)
          codeImageUrl: type === "VERSCHLUSS" ? (codeImageUrl || null) : null,
          codeReadable: type === "VERSCHLUSS" && codeImageUrl ? (codeReadable ?? null) : null,
          keyInBox: type === "VERSCHLUSS" ? keyInBoxDeclared : null,
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
      if (type === "PRUEFUNG" && verification) {
        const openWhere = {
          userId: session.user.id, entryId: null, withdrawnAt: null,
          ...aktiveKontrolleWhere(),
        };
        // Der Rundum-Weg trifft NUR Anforderungen, die selbst ohne Code entstanden sind (`code: null`).
        // Ohne diese Schranke wäre der Toggle ein Umweg um eine bestehende Kontrolle: eine Anforderung
        // MIT Code, gestellt während ein Code-Gerät getragen wurde, liesse sich erfüllen, indem der Sub
        // aufschliesst, ein Gerät ohne Code-Pflicht anlegt und ein blankes Foto einreicht — der Code
        // wäre nie getippt und nie geprüft worden. Ob ein Code verlangt wird, entscheidet das
        // Gerät zur EINREICHUNG; welchen Nachweis eine Anforderung verlangt, steht in IHR.
        const target =
          verification.kind === "code"
            ? await tx.kontrollAnforderung.findFirst({ where: { ...openWhere, code: verification.code }, select: { id: true } })
            : verification.kind === "none" && verification.codeRequired
              // Freiwillige Selbstkontrolle an einem Gerät MIT Code-Pflicht: erfüllt nichts.
              ? null
              : await tx.kontrollAnforderung.findFirst({
                  where: { ...openWhere, code: null },
                  orderBy: { deadline: "asc" },
                  select: { id: true },
                });
        if (target) {
          await tx.kontrollAnforderung.update({
            where: { id: target.id },
            data: { entryId: created.id, fulfilledAt: new Date() },
          });
        }
      }

      // VerschlussAnforderung (ANFORDERUNG) als erfüllt markieren + ggf. SPERRZEIT erstellen
      if (type === "VERSCHLUSS") {
        // ALLE offenen, bereits ausgelösten Anforderungen — mehrere dürfen koexistieren, und dieser
        // eine Verschluss erfüllt sie alle: jede verlangte „sei verschlossen", und das ist er jetzt.
        // Liesse man die übrigen offen, würden sie bei Fristablauf zu „zu spät verschlossen"-
        // Vergehen im Strafbuch, obwohl der Sub genau das Verlangte getan hat.
        // Geplante, noch nicht versendete bleiben aussen vor — sie dürfen nicht vorzeitig als
        // erfüllt gelten (dringendste zuerst, siehe getOpenLockRequests).
        const offeneAnforderungen = await tx.verschlussAnforderung.findMany({
          where: { ...openLockRequestWhere(session.user.id), ...activeVerschlussAnforderungWhere(new Date()) },
          orderBy: LOCK_REQUEST_ORDER,
        });
        if (offeneAnforderungen.length > 0) {
          await tx.verschlussAnforderung.updateMany({
            where: { id: { in: offeneAnforderungen.map((a) => a.id) } },
            data: { fulfilledAt: new Date() },
          });
          // Die GEFORDERTEN Geräte aller erfüllten Anforderungen einsammeln (Anforderungen OHNE
          // Gerätevorgabe stellen keine und fallen weg). Mehrere können verschiedene Geräte verlangen;
          // der Sub kann aber nur EINES tragen. Er gilt als korrekt, sobald sein Gerät irgendeine der
          // GEFORDERTEN Vorgaben trifft — sonst würde er für einen Konflikt bestraft, den er gar nicht
          // auflösen konnte (zwei Anforderungen, zwei verschiedene Pflicht-Geräte). Trifft er KEINE der
          // geforderten, greift die Falsch-Gerät-Ahndung unten; eine geforderte Vorgabe wird also nicht
          // dadurch entwertet, dass daneben eine geräte-freie Anforderung offen ist.
          requiredAnforderungDeviceIds = offeneAnforderungen.map((a) => a.deviceId).filter((d): d is string => d !== null);
        }
        // SPERRZEIT-Ende je Anforderung: absolutes sperrEndetAt (Wanduhr) gewinnt und bleibt fix, egal
        // wann tatsächlich verschlossen wurde; sonst dauerH relativ zur Verschlusszeit (Bestandsverhalten).
        //
        // Anders als `createVerschlussAnforderung` (Keyholder-Pfad) zieht das hier KEINE bestehenden
        // Sperrzeiten zurück — bewusst. Dort ERSETZT die Keyholderin ihre eigene Direktive; hier
        // handelt der Sub, und dass er sich zwischendurch selbst einschliesst, darf eine geplante
        // Anweisung der Keyholderin nicht stillschweigend löschen — er kennt sie ja nicht einmal,
        // es fiele also niemandem auf. Dasselbe gilt für mehrere hier erzeugte Sperrzeiten: wie sie
        // zur EFFEKTIVEN aufgelöst werden, steht bei `foldActiveSperrzeiten` (queries.ts).
        const neueSperrzeiten = offeneAnforderungen.flatMap((a) => {
          const sperrEnde = a.sperrEndetAt ?? (a.dauerH ? new Date(Date.now() + a.dauerH * 60 * 60 * 1000) : null);
          return sperrEnde
            ? [{
                userId: session.user.id,
                art: "SPERRZEIT",
                nachricht: a.nachricht,
                endetAt: sperrEnde,
                reinigungErlaubt: a.reinigungErlaubt,
              }]
            : [];
        });
        // Ein Insert statt einer je Anforderung — der POST-Pfad des Subs ist heiss genug, dass sich
        // N Round-Trips innerhalb der Transaktion nicht lohnen.
        if (neueSperrzeiten.length > 0) {
          await tx.verschlussAnforderung.createMany({ data: neueSperrzeiten });
        }
      }

      // OrgasmusAnforderung als erfüllt markieren, wenn ein passender Orgasmus im Fenster erfasst wird.
      // Matching auf vorgegebene Art (Basis), wenn gesetzt; sonst zählt jeder Orgasmus.
      if (type === "ORGASMUS") {
        const entryTime = new Date(startTime);
        const offeneAnforderung = await tx.orgasmusAnforderung.findFirst({
          where: {
            userId: session.user.id,
            fulfilledAt: null,
            withdrawnAt: null,
            beginntAt: { lte: entryTime },
            endetAt: { gte: entryTime },
          },
          orderBy: { createdAt: "desc" },
        });
        if (
          offeneAnforderung &&
          (!offeneAnforderung.vorgegebeneArt ||
            offeneAnforderung.vorgegebeneArt === parseOrgasmusArtBase(orgasmusArt))
        ) {
          await tx.orgasmusAnforderung.update({
            where: { id: offeneAnforderung.id },
            data: { fulfilledAt: new Date(), entryId: created.id },
          });
        }
      }

      // Box-Kopplung: die Heimdall-Box folgt dem Eintrag. Die Regel — samt der zwei Fälle, in denen
      // sie ihm NICHT folgt — steht in `boxCommandForEntry`. No-op ohne Heimdall/Box.
      boxCmd = boxCommandForEntry({ type, keyInBox: keyInBoxDeclared, brokeSperrzeit: withdrawnSperrzeit });
      if (boxCmd) await setBoxCommandForUser(tx, session.user.id, boxCmd);

      return created;
    });
  } catch (e: unknown) {
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

  // Auto-create StrafeRecord when user picked a different device than the Anforderung specified.
  // Automatische Ahndung ohne Urteilsschritt → sofort erledigt (judgedBy=system), damit sie
  // nicht als offene Strafe im Urteilsloop hängt.
  if (type === "VERSCHLUSS" && requiredAnforderungDeviceIds.length > 0 && !requiredAnforderungDeviceIds.includes(deviceId || "")) {
    try {
      const now = new Date();
      await prisma.strafeRecord.create({
        data: {
          userId: session.user.id,
          offenseType: "FALSCHES_GERAET",
          refId: entry.id,
          bestraftDatum: now,
          notiz: null,
          judgedBy: "system",
          erledigtAt: now,
        },
      });
    } catch { /* ignore if duplicate — e.g. offline replay */ }
  }

  markLastAction();

  // Der Geräte-Check braucht den letzten Lock-Entry (welches Gerät ist verschlossen?). Die
  // Foto-Verifikation braucht ihn NICHT mehr: was sie zu prüfen hat, steht in `verification`, und das
  // wurde in der Transaktion aus demselben Eintrag abgeleitet — dort, wo es konsistent ist.
  const latestLockPromise =
    type === "PRUEFUNG" && imageUrl ? getLatestKgEntry(session.user.id) : null;

  // Kontroll-Geräte-Check (advisory): ist das aktuell verschlossene Gerät im Kontroll-Foto sichtbar?
  // Server-seitig + fire-and-forget (blockiert die Antwort NICHT); Ergebnis landet als entry.deviceCheck,
  // das der Keyholder sieht. Der Vorgang (inkl. der Pflicht, das oben gesetzte "pending" IMMER durch
  // einen Endzustand zu ersetzen) liegt in deviceCheckService — hier steht nur der Start.
  if (deviceCheckApplies(type, imageUrl)) {
    void runDeviceCheck({
      entryId: entry.id,
      userId: session.user.id,
      photoUrl: imageUrl!,
      lockEntry: latestLockPromise ?? Promise.resolve(null),
    });
  }

  // Notify admins based on per-user NotificationPreference (fire-and-forget)
  (async () => {
    try {
      const eventTypes: string[] = [];
      if (type === "VERSCHLUSS") eventTypes.push("VERSCHLUSS");
      if (type === "OEFFNEN") {
        eventTypes.push("OEFFNUNG_IMMER");
        if (withdrawnSperrzeit) eventTypes.push("OEFFNUNG_VERBOTEN");
      }
      if (type === "ORGASMUS") eventTypes.push("ORGASMUS");
      if (type === "PRUEFUNG" && kontrollCode) eventTypes.push("KONTROLLE_ANGEFORDERT");
      if (type === "PRUEFUNG" && !kontrollCode) eventTypes.push("KONTROLLE_FREIWILLIG");
      if (type === "WEAR_BEGIN") eventTypes.push("WEAR_BEGIN_ANY");
      if (type === "WEAR_END") eventTypes.push("WEAR_END_ANY");

      if (eventTypes.length === 0) return;

      const prefs = await prisma.notificationPreference.findMany({
        where: { userId: session.user.id, eventType: { in: eventTypes }, OR: [{ mail: true }, { push: true }] },
      });
      if (prefs.length === 0) return;

      const shouldPush = prefs.some((p) => p.push);
      const shouldMail = prefs.some((p) => p.mail);

      // Build descriptive message
      const username = session.user.name ?? "User";
      const time = formatDateTime(new Date(startTime));
      const [tOpen, tOrgasm] = await Promise.all([
        getTranslations({ locale: "de", namespace: "openForm" }),
        getTranslations({ locale: "de", namespace: "orgasmForm" }),
      ]);
      let title = "";
      let pushBody = "";

      // Labels über die Reason-Config des Entry-Owners (= handelnder User) auflösen — Custom-Labels
      // erscheinen so auch in Push/Mail, mit Built-in-i18n/Rohwert als Fallback.
      const openingCfg = effectiveOeffnenGruende(reasonUser?.oeffnenGruendeConfig);
      const orgasmCfg = effectiveOrgasmusArten(reasonUser?.orgasmusArtenConfig);
      const grundLabel = (g: string) => resolveReasonLabel(g, openingCfg, "opening", tOpen);
      const orgasmusArtLabel = (a: string) => resolveOrgasmusArtDisplay(a, orgasmCfg, tOrgasm) ?? a;

      if (type === "VERSCHLUSS") {
        title = `${username} hat sich eingeschlossen`;
        pushBody = time;
      } else if (type === "OEFFNEN") {
        title = `${username} hat sich geöffnet`;
        pushBody = oeffnenGrund ? `${time} · Grund: ${grundLabel(oeffnenGrund)}` : time;
      } else if (type === "ORGASMUS") {
        title = `${username} — Orgasmus`;
        pushBody = orgasmusArt ? `${time} · ${orgasmusArtLabel(orgasmusArt)}` : time;
      } else if (type === "PRUEFUNG") {
        title = kontrollCode ? `${username} hat Kontrolle erfüllt` : `${username} — Selbstkontrolle`;
        pushBody = kontrollCode ? `${time} · Code: ${kontrollCode}` : time;
      } else if (type === "WEAR_BEGIN" || type === "WEAR_END") {
        // Resolve category name for the notification body via the device.
        const dev = deviceId
          ? await prisma.device.findUnique({
              where: { id: deviceId },
              select: { name: true, category: { select: { name: true } } },
            })
          : null;
        const catName = dev?.category?.name ?? "?";
        const verb = type === "WEAR_BEGIN" ? "trägt" : "hat abgelegt";
        title = `${username} ${verb} ${catName}`;
        pushBody = dev?.name ? `${time} · ${dev.name}` : time;
      }

      const adminUrl = `/admin/users/${session.user.id}`;
      const adminLink = `${appBaseUrl()}${adminUrl}`;

      // Recipients = global admins + the sub's keyholders (controllers via AdminUserRelationship).
      // Keyholders are role "user", so a role:"admin" query alone would miss them.
      const recipients = await getControllersOfUser(session.user.id);

      if (shouldPush) {
        await Promise.allSettled(
          recipients.map((a) => sendPushToUser(a.id, title, pushBody, adminUrl))
        );
      }
      if (shouldMail) {
        const details: string[] = [];
        details.push(`<strong>Zeitpunkt:</strong> ${escHtml(time)}`);

        if (type === "OEFFNEN" && oeffnenGrund) {
          details.push(`<strong>Grund:</strong> ${escHtml(grundLabel(oeffnenGrund))}`);
        }
        if (type === "ORGASMUS" && orgasmusArt) {
          details.push(`<strong>Art:</strong> ${escHtml(orgasmusArtLabel(orgasmusArt))}`);
        }
        if (kontrollCode) {
          details.push(`<strong>Siegel / Code:</strong> <span style="font-family:monospace;font-weight:bold;color:#f97316">${escHtml(kontrollCode)}</span>`);
        }
        if (type === "OEFFNEN" && lockStartTime) {
          const dur = formatDuration(lockStartTime, new Date(startTime));
          details.push(`<strong>Tragedauer:</strong> ${escHtml(dur)}`);
        }

        details.push(`<strong>Foto:</strong> ${imageUrl ? "Ja ✓" : "Nein"}`);

        // Schlüssel-Deklaration im Klartext, „nicht in der Box" in Rot: das ist die eine Angabe,
        // die entscheidet, ob der Verschluss überhaupt hardware-gesichert ist. Bewusst die
        // DEKLARATION, nicht das KI-Urteil — die Mail geht sofort raus, die Erkennung läuft erst.
        if (type === "VERSCHLUSS" && keyInBoxDeclared !== null) {
          details.push(
            keyInBoxDeclared
              ? `<strong>Schlüssel:</strong> in der Box`
              : `<strong>Schlüssel:</strong> <span style="color:#dc2626;font-weight:bold">NICHT in der Box</span>`,
          );
        }

        if (note) {
          details.push(`<strong>Notiz:</strong> <em>${escHtml(note)}</em>`);
        }

        const accent = TYPE_EMAIL_COLORS[type] ?? "#1e293b";

        const emailHtml = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="border-left:4px solid ${accent};padding-left:16px;margin-bottom:16px">
            <h2 style="color:#1e293b;margin:0 0 4px 0">${escHtml(title)}</h2>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155">
            ${details.map((d) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${d}</td></tr>`).join("")}
          </table>
          <p style="margin-top:20px">
            <a href="${escHtml(adminLink)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:14px">
              Im Admin-Dashboard ansehen →
            </a>
          </p>
          <p style="color:#94a3b8;font-size:12px;margin-top:12px">Falls der Link nicht funktioniert: ${escHtml(adminLink)}</p>
        </div>`;

        for (const r of recipients) {
          if (r.email) {
            void sendMailSafe(r.email, `KG-Tracker – ${title}`, emailHtml);
          }
        }
      }
    } catch { /* ignore notification errors */ }
  })();

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
