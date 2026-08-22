import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdminApi, requireKeyholderOrAdminApi, requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import bcrypt from "bcryptjs";
import { isValidEmail, passwordErrorCode, isValidLocale } from "@/lib/constants";
import { getActiveSperrzeit, getIsLocked } from "@/lib/queries";
import { buildNewEntryCategoryRows } from "@/lib/categoryRows";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { recordAdminPasswordChange } from "@/lib/passwordAudit";
import { setReinigungSettings } from "@/lib/reinigungService";
import { setAutoKontrolleSettings } from "@/lib/autoKontrolleService";
import { setInspectionEscalationSettings } from "@/lib/inspectionEscalationService";
import { setReasonConfig } from "@/lib/reasonsService";
import { setWeightSettingsKeyholder } from "@/lib/weightSettingsService";
import { weightTrackingEnabled } from "@/lib/constants";
import { deleteUploadedFiles, entryImageUrls } from "@/lib/imageUtils";
import { serviceResponse } from "@/lib/serviceResult";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const err = await requireKeyholderOrAdminApi(id);
  if (err) return err;

  // `categoryRows`: die „Neu erfassen"-Auswahl der Keyholder-Sicht (AdminFAB) — dieselbe Ableitung
  // wie im Sub-Dashboard, nur für den betrachteten Sub.
  const [user, isLocked, offeneAnforderung, activeSperrzeit, categoryRows] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { username: true, email: true } }),
    getIsLocked(id),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", withdrawnAt: null, fulfilledAt: null },
    }),
    getActiveSperrzeit(id),
    buildNewEntryCategoryRows(id),
  ]);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    username: user.username,
    email: user.email,
    isLocked,
    hasOffeneAnforderung: !!offeneAnforderung,
    hasActiveSperrzeit: !!activeSperrzeit,
    categoryRows,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const err =
    body.role !== undefined
      ? await requireAdminApi()
      : await requireKeyholderOrAdminApi(id);
  if (err) return err;

  if (body.password !== undefined) {
    const pwErr = passwordErrorCode(body.password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    // Zweiter `auth()`-Aufruf, weil die Guards oben nur erlauben/ablehnen und die Sitzung nicht
    // durchreichen (58 Aufrufstellen — deren Signatur zu ändern gehört nicht in diesen Patch).
    // Kostet bei der JWT-Strategie nur ein Cookie-Decode, und ein fremdgesetztes Passwort ist
    // selten; wer es war, ist für den Keyholder die halbe Information.
    const actorUserId = (await auth())?.user?.id ?? null;
    await recordAdminPasswordChange(id, "set_by_other", actorUserId);
    return NextResponse.json({ ok: true });
  }

  if (body.email !== undefined) {
    const email = body.email?.trim() || null;
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "emailInvalid" }, { status: 400 });
    }
    try {
      const user = await prisma.user.update({ where: { id }, data: { email } });
      return NextResponse.json({ id: user.id, email: user.email });
    } catch (err) {
      if (isUniqueConstraintOn(err, "email")) {
        return NextResponse.json({ error: "emailTaken" }, { status: 409 });
      }
      throw err;
    }
  }

  if (
    body.reinigungErlaubt !== undefined || body.reinigungMaxMinuten !== undefined ||
    body.reinigungMaxProTag !== undefined || body.reinigungsFenster !== undefined
  ) {
    // Zweiter Guard-Aufruf in der Actor-Variante, aus demselben Grund wie beim Passwort oben: die
    // Historie hält fest, WER das Kontingent gesenkt hat, und der Guard am Anfang der Route reicht
    // die Sitzung nicht durch. Kostet bei der JWT-Strategie nur ein Cookie-Decode.
    const actor = await requireKeyholderOrAdminActor(id);
    if (actor instanceof NextResponse) return actor;
    return serviceResponse(await setReinigungSettings(id, {
      erlaubt: body.reinigungErlaubt !== undefined ? Boolean(body.reinigungErlaubt) : undefined,
      maxMinuten: body.reinigungMaxMinuten !== undefined ? Number(body.reinigungMaxMinuten) : undefined,
      maxProTag: body.reinigungMaxProTag !== undefined ? Number(body.reinigungMaxProTag) : undefined,
      fenster: body.reinigungsFenster, // roh — der Service validiert/normalisiert
      changedBy: sessionActor(actor),
    }));
  }

  if (
    body.autoKontrolleAktiv !== undefined || body.autoKontrollePerDayMin !== undefined ||
    body.autoKontrollePerDayMax !== undefined ||
    body.autoKontrolleRuheVon !== undefined || body.autoKontrolleRuheBis !== undefined ||
    body.autoKontrolleFristVon !== undefined || body.autoKontrolleFristBis !== undefined ||
    body.autoKontrolleFensterVon !== undefined || body.autoKontrolleFensterBis !== undefined ||
    body.autoKontrolleNurBeiSperre !== undefined
  ) {
    // Felder roh durchreichen — setAutoKontrolleSettings klemmt/validiert (HH:MM, Bereiche, Bis≥Von).
    return serviceResponse(await setAutoKontrolleSettings(id, {
      aktiv: body.autoKontrolleAktiv, perDayMin: body.autoKontrollePerDayMin, perDayMax: body.autoKontrollePerDayMax,
      ruheVon: body.autoKontrolleRuheVon, ruheBis: body.autoKontrolleRuheBis,
      fristVon: body.autoKontrolleFristVon, fristBis: body.autoKontrolleFristBis,
      fensterVon: body.autoKontrolleFensterVon, fensterBis: body.autoKontrolleFensterBis,
      nurBeiSperre: body.autoKontrolleNurBeiSperre,
    }));
  }

  if (
    body.inspectionReminderEnabled !== undefined || body.inspectionReminderDelayMinutes !== undefined ||
    body.inspectionAutoMarkEnabled !== undefined || body.inspectionAutoMarkDelayMinutes !== undefined
  ) {
    return serviceResponse(await setInspectionEscalationSettings(id, {
      reminderEnabled: body.inspectionReminderEnabled, reminderDelayMinutes: body.inspectionReminderDelayMinutes,
      autoMarkEnabled: body.inspectionAutoMarkEnabled, autoMarkDelayMinutes: body.inspectionAutoMarkDelayMinutes,
    }));
  }

  if (body.orgasmusArtenConfig !== undefined) {
    const config = await setReasonConfig(id, "orgasm", body.orgasmusArtenConfig);
    return NextResponse.json({ ok: true, config });
  }
  if (body.oeffnenGruendeConfig !== undefined) {
    const config = await setReasonConfig(id, "opening", body.oeffnenGruendeConfig);
    return NextResponse.json({ ok: true, config });
  }

  if (
    body.weightTrackingEnabled !== undefined || body.weighingWindows !== undefined ||
    body.targetMinKeyholderKg !== undefined || body.targetMaxKeyholderKg !== undefined
  ) {
    // Instanz-Schalter zuerst: ist das Feature auf dieser Instanz abgewählt, gibt es die
    // Einstellung nicht — 404 statt 403, damit die Antwort nicht verrät, dass es sie gäbe. Der
    // Schalter je Sub wird hier NICHT geprüft: er steht in genau diesem Patch.
    if (!weightTrackingEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return serviceResponse(await setWeightSettingsKeyholder(id, {
      enabled: body.weightTrackingEnabled,
      weighingWindows: body.weighingWindows, // roh — der Service validiert/normalisiert
      targetMinKeyholderKg: body.targetMinKeyholderKg,
      targetMaxKeyholderKg: body.targetMaxKeyholderKg,
    }));
  }

  if (body.mobileDesktopUpload !== undefined) {
    await prisma.user.update({ where: { id }, data: { mobileDesktopUpload: Boolean(body.mobileDesktopUpload) } });
    return NextResponse.json({ ok: true });
  }

  if (body.locale !== undefined) {
    if (!isValidLocale(body.locale)) {
      return NextResponse.json({ error: "invalidLocale" }, { status: 400 });
    }
    await prisma.user.update({ where: { id }, data: { locale: body.locale } });
    return NextResponse.json({ ok: true });
  }

  if (body.mcpKeyholderInstructions !== undefined) {
    const text = typeof body.mcpKeyholderInstructions === "string" ? body.mcpKeyholderInstructions.trim() : "";
    await prisma.user.update({ where: { id }, data: { mcpKeyholderInstructions: text || null } });
    return NextResponse.json({ ok: true });
  }

  if (!["admin", "user"].includes(body.role)) {
    return NextResponse.json({ error: "invalidRole" }, { status: 400 });
  }

  // Den letzten Admin zu degradieren sperrt die Instanz dauerhaft aus dem Adminbereich aus — zurück
  // geht es nur noch per DB-Zugriff durch den Betreiber. Gegenstück zu `cannotDeleteSelf` im DELETE.
  // Selbst-Degradierung bleibt erlaubt, solange ein zweiter Admin bleibt: „Rechte an den Keyholder
  // übergeben und selbst Sub werden" ist ein gewollter Ablauf.
  // Lesen und Schreiben in EINER Transaktion, damit zwei gleichzeitige Degradierungen nicht beide
  // an der Prüfung vorbeikommen. Dass das hält, liegt am `connection_limit=1` aus prisma.ts (alle
  // Queries laufen seriell über EINE Verbindung) — nicht an der Transaktion allein: das blosse
  // Read-then-Write ist unter SQLite-Snapshot-Isolation Best-Effort (siehe kontrolleService.ts).
  // Der zweite Schreiber auf dieselbe Datei ist das Portal; dort steht derselbe Guard.
  const user = await prisma.$transaction(async (tx) => {
    if (body.role === "user") {
      // `take: 2` reicht: gefragt ist nicht die Anzahl, sondern ob ausser diesem noch einer da ist.
      const admins = await tx.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 2 });
      if (admins.length === 1 && admins[0].id === id) return null;
    }
    return tx.user.update({ where: { id }, data: { role: body.role } });
  });
  if (!user) return NextResponse.json({ error: "lastAdmin" }, { status: 409 });

  return NextResponse.json({ id: user.id, role: user.role });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;

  const session = await auth();
  const { id } = await params;

  if (id === session!.user.id) {
    return NextResponse.json({ error: "cannotDeleteSelf" }, { status: 400 });
  }

  // H5 (Recht auf Vergessenwerden): alle Foto-Dateien des Nutzers VOR dem Cascade-Delete einsammeln,
  // danach von der Platte entfernen (DB-Zeilen kaskadieren, die Dateien nicht).
  const [entries, devices, refs] = await Promise.all([
    prisma.entry.findMany({ where: { userId: id }, select: { imageUrl: true, codeImageUrl: true, boxImageUrl: true } }),
    prisma.device.findMany({ where: { userId: id }, select: { imageUrl: true } }),
    prisma.deviceReferenceImage.findMany({ where: { device: { userId: id } }, select: { imageUrl: true } }),
  ]);

  await prisma.user.delete({ where: { id } });

  void deleteUploadedFiles([
    ...entries.flatMap(entryImageUrls),
    ...devices.map((d) => d.imageUrl),
    ...refs.map((r) => r.imageUrl),
  ]);
  return new NextResponse(null, { status: 204 });
}
