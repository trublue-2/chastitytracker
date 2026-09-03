import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes } from "@/lib/reasonsService";
import { validateDeviceOwnership } from "@/lib/queries";
import { entryManageAccess } from "@/lib/keyholder";
import { entryGuardCode } from "@/lib/entryErrors";
import { assertEntryTimeOk, deleteEntryForUser, entryPairTypes, entryPersistsDevice } from "@/lib/entryCorrection";
import { serviceFailure } from "@/lib/serviceResult";
import { WEAR_PAIR } from "@/lib/utils";
import { isDevBypassEnabled } from "@/lib/devMode";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { isPendingLock } from "@/lib/lockPending";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.entry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  // Bearbeiten darf: der Eigentümer, ein globaler Admin ODER ein Keyholder des Eigentümers (scoped admin).
  const { allowed, elevated } = await entryManageAccess(session.user.id, session.user.role, existing.userId);
  if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, verifikationStatus, deviceId } = body;

  if (!isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "INVALID_IMAGE_URL" }, { status: 400 });
  }
  // Reason-Codes gegen die Listen DES ENTRY-EIGENTÜMERS validieren (Admin darf einen fremden Eintrag
  // bearbeiten → dessen Config, nicht die des Admins). null-Config → Built-ins. Nur validieren, wenn
  // der Grund/die Art sich tatsächlich ÄNDERT — ein unveränderter Bestandswert (z.B. bei reinem
  // Zeit-Edit) bleibt immer gültig, auch wenn die Art inzwischen aus der Liste entfernt wurde.
  const changesOeffnen = oeffnenGrund !== undefined && oeffnenGrund !== null && oeffnenGrund !== existing.oeffnenGrund;
  const changesOrgasmus = orgasmusArt !== undefined && orgasmusArt !== null && orgasmusArt !== existing.orgasmusArt;
  if (changesOeffnen || changesOrgasmus) {
    const reasonOwner = await prisma.user.findUnique({
      where: { id: existing.userId },
      select: { orgasmusArtenConfig: true, oeffnenGruendeConfig: true },
    });
    if (changesOeffnen && !validOeffnenCodes(reasonOwner?.oeffnenGruendeConfig).has(oeffnenGrund)) {
      return NextResponse.json({ error: "INVALID_OPENING_REASON" }, { status: 400 });
    }
    if (changesOrgasmus && !orgasmusValueAllowed(orgasmusArt as string, reasonOwner?.orgasmusArtenConfig)) {
      return NextResponse.json({ error: "INVALID_ORGASM_TYPE" }, { status: 400 });
    }
  }

  const devBypass = isDevBypassEnabled(req.headers.get("host"));

  // Time-shift direction enforcement for non-admins (anti-cheat)
  // Skipped when running on localhost in dev (test enablement).
  if (startTime && !elevated && !devBypass) {
    const newTime = new Date(startTime);
    const oldTime = existing.startTime;
    // Forward-only: VERSCHLUSS, PRUEFUNG, WEAR_BEGIN
    if ((existing.type === "VERSCHLUSS" || existing.type === "PRUEFUNG" || existing.type === "WEAR_BEGIN") && newTime < oldTime) {
      return NextResponse.json({ error: "TIME_FORWARD_ONLY" }, { status: 400 });
    }
    // Backward-only: OEFFNEN, ORGASMUS, WEAR_END
    if ((existing.type === "OEFFNEN" || existing.type === "ORGASMUS" || existing.type === "WEAR_END") && newTime > oldTime) {
      return NextResponse.json({ error: "TIME_BACKWARD_ONLY" }, { status: 400 });
    }
  }

  // Nachweis-Erhalt (Anti-Cheat, wie die Zeitrichtung oben nur für den Sub): einer ANGEFORDERTEN
  // Kontrolle darf das Foto nicht nachträglich entzogen werden. Beim Anlegen erzwingt
  // `validateEntryPayload` das Foto — ohne diesen Guard liesse sich derselbe Zustand in zwei
  // Schritten herstellen: mit Foto erfassen (die KontrollAnforderung wird auf `fulfilledAt`
  // gesetzt), danach `imageUrl: null` patchen. Die Anforderung bliebe erfüllt, im Strafbuch
  // entstünde kein `late`-Vergehen — übrig bliebe ein Nachweis ohne Nachweis. Dasselbe gilt für
  // den umgekehrten Weg, einem fotolosen Eintrag nachträglich einen `kontrollCode` anzuhängen.
  // Geprüft wird NUR, dass überhaupt ein Foto da ist; ob es taugt (Gerät erkennbar, Code lesbar),
  // entscheidet die Keyholderin. Eine freiwillige Kontrolle ohne `kontrollCode` hat niemand
  // angefordert und bleibt unberührt.
  // Ein einmal gesetzter Code zählt weiter (`existing.kontrollCode`), sonst wäre der Guard mit
  // einem einzigen `{ kontrollCode: null, imageUrl: null }` auszuhebeln: die KontrollAnforderung
  // hängt am `entryId`, nicht am Code, und bliebe auch ohne ihn erfüllt.
  const requestedInspection = !!existing.kontrollCode || !!kontrollCode;
  const nextImageUrl = imageUrl !== undefined ? imageUrl : existing.imageUrl;
  if (!elevated && existing.type === "PRUEFUNG" && requestedInspection && !nextImageUrl) {
    return NextResponse.json({ error: "INSPECTION_PHOTO_REQUIRED" }, { status: 400 });
  }

  // Validate deviceId ownership (VERSCHLUSS + WEAR_BEGIN/END entries)
  const persistsDevice = entryPersistsDevice(existing.type);
  if (deviceId && persistsDevice) {
    const device = await validateDeviceOwnership(deviceId, existing.userId);
    if (!device) return NextResponse.json({ error: "INVALID_DEVICE" }, { status: 400 });
  }

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Re-validate temporal ordering when startTime is changed on a paired entry
      // (VERSCHLUSS/OEFFNEN globally, WEAR_BEGIN/WEAR_END scoped to the device's category).
      // Skipped entirely on localhost dev for test enablement.
      //
      // Die Regel steht in `entryCorrection.ts` und nicht mehr hier: seit die KI-Keyholderin
      // Einträge über den MCP korrigieren darf, gibt es einen zweiten Aufrufer — und zwei Fassungen
      // derselben Ketten-Prüfung liefen beim nächsten Umbau auseinander.
      if (!devBypass && startTime) await assertEntryTimeOk(tx, existing, new Date(startTime));

      return tx.entry.update({
        where: { id },
        data: {
          ...(startTime && { startTime: new Date(startTime) }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(imageExifTime !== undefined && {
            imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          }),
          ...(note !== undefined && { note }),
          ...(oeffnenGrund !== undefined && { oeffnenGrund }),
          ...(orgasmusArt !== undefined && { orgasmusArt }),
          ...(kontrollCode !== undefined && { kontrollCode }),
          ...(deviceId !== undefined && persistsDevice && { deviceId: deviceId || null }),
          // verifikationStatus only settable by a controller (admin/keyholder), never the sub —
          // same right as manually verifying a control (/api/admin/kontrollen/[id]).
          ...(verifikationStatus !== undefined && elevated && { verifikationStatus }),
        },
      });
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: entryGuardCode(e) }, { status: 400 });
  }

  // H5: wird das Foto ersetzt, die alte verwaiste Datei löschen (fire-and-forget).
  if (imageUrl !== undefined && existing.imageUrl && imageUrl !== existing.imageUrl) {
    void deleteUploadedFiles([existing.imageUrl]);
  }

  return NextResponse.json(entry);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.entry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  // Löschen darf: der Eigentümer, ein globaler Admin ODER ein Keyholder des Eigentümers (scoped admin).
  const { allowed } = await entryManageAccess(session.user.id, session.user.role, existing.userId);
  if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const force = req.nextUrl.searchParams.get("force") === "true";
  const withPartner = req.nextUrl.searchParams.get("withPartner") === "true";
  const partnerId = req.nextUrl.searchParams.get("partnerId");

  const pair = entryPairTypes(existing.type);
  const isWearPair = pair === WEAR_PAIR;
  const isPair = pair !== null;

  // Chain-break detection for paired entries (VERSCHLUSS/OEFFNEN global; WEAR-pair per category)
  //
  // Ein schwebender Verschluss-AUFRUF ist von der Prüfung ausgenommen: er steht per Definition
  // NICHT in der Kette (`effectiveEntryWhere` blendet ihn überall aus), also kann sein Löschen sie
  // auch nicht brechen. Ohne diese Ausnahme müsste die Zurücknehmen-Aktion mit `force=true` an
  // einer Prüfung vorbei, die für sie gar nicht gedacht ist.
  if (isPair && !force && !isPendingLock(existing)) {
    const pairTypes = [pair.close, pair.open];
    const wearCategoryId = isWearPair && existing.deviceId
      ? (await prisma.device.findUnique({ where: { id: existing.deviceId }, select: { categoryId: true } }))?.categoryId
      : null;
    const categoryFilter = isWearPair && wearCategoryId ? { device: { categoryId: wearCategoryId } } : {};
    const [prev, next] = await Promise.all([
      prisma.entry.findFirst({
        where: { userId: existing.userId, type: { in: [...pairTypes] }, startTime: { lt: existing.startTime }, ...categoryFilter },
        orderBy: { startTime: "desc" },
        select: { id: true, type: true, startTime: true, imageUrl: true, codeImageUrl: true, boxImageUrl: true },
      }),
      prisma.entry.findFirst({
        where: { userId: existing.userId, type: { in: [...pairTypes] }, startTime: { gt: existing.startTime }, ...categoryFilter },
        orderBy: { startTime: "asc" },
        select: { id: true, type: true, startTime: true, imageUrl: true, codeImageUrl: true, boxImageUrl: true },
      }),
    ]);

    const wouldBreak = prev && next && prev.type === next.type;

    if (wouldBreak) {
      // Pair partner is "next" for the start-half (VERSCHLUSS/WEAR_BEGIN), "prev" for the end-half.
      const isStartHalf = existing.type === "VERSCHLUSS" || existing.type === "WEAR_BEGIN";
      const partner = isStartHalf ? next : prev;

      if (withPartner) {
        if (partnerId && partnerId !== partner.id) {
          return NextResponse.json({ error: "PARTNER_CHANGED" }, { status: 409 });
        }
        const result = await deleteEntryForUser(existing, partner.id);
        if (!result.ok) return serviceFailure(result);
        revalidatePath("/dashboard", "layout");
        return new NextResponse(null, { status: 204 });
      }

      // Return chain break info without deleting
      return NextResponse.json({
        chainBreak: true,
        partner: { id: partner.id, type: partner.type, startTime: partner.startTime },
      });
    }
  }

  // No chain break, force=true, or non-VO entry: delete normally. Was daran hängt (Box-Kommando
  // eines schwebenden Aufrufs, Freigabe der Kontroll-Anforderung, Bilddateien), steht im Dienst —
  // die KI-Keyholderin löscht über denselben Weg (`delete_entry`).
  const result = await deleteEntryForUser(existing, null);
  if (!result.ok) return serviceFailure(result);

  if (isPair) {
    revalidatePath("/dashboard", "layout");
  }

  return new NextResponse(null, { status: 204 });
}
