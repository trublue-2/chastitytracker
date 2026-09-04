import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { updateLockPeriodEnd, updateLockRequest, withdrawVerschlussAnforderungById } from "@/lib/verschlussAnforderungService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Die Bestandswerte EINER offenen Einschliess-Anforderung — Vorlage für das Bearbeiten-Formular.
 *  Nur ANFORDERUNG: eine Sperrzeit bearbeitet man über `setEnd`, nicht hierüber. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: {
      userId: true, art: true, message: true, endsAt: true, minDurationHours: true,
      lockEndsAt: true, deviceId: true, cleaningAllowed: true, wirksamAb: true,
    },
  });
  if (!va) return errorResponse(404, "NOT_FOUND");

  const actor = await requireKeyholderOrAdminActor(va.userId);
  if (actor instanceof NextResponse) return actor;

  if (va.art !== "ANFORDERUNG") return errorResponse(400, "LOCK_INVALID_ART");

  return NextResponse.json({
    id,
    message: va.message,
    endsAt: va.endsAt?.toISOString() ?? null,
    minDurationHours: va.minDurationHours,
    lockEndsAt: va.lockEndsAt?.toISOString() ?? null,
    deviceId: va.deviceId,
    cleaningAllowed: va.cleaningAllowed,
    wirksamAb: va.wirksamAb?.toISOString() ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true },
  });
  if (!va) return errorResponse(404, "NOT_FOUND");

  const actor = await requireKeyholderOrAdminActor(va.userId);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json();

  if (body.action === "withdraw") {
    // Über den Service: nur der kennt die Regel „terminierte Direktiven nicht melden" und den
    // Heimdall-Push. Die Route rechnete beides früher selbst nach — und lag bei beidem falsch.
    const result = await withdrawVerschlussAnforderungById(id, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  }

  // edit: eine offene ANFORDERUNG ändern. Das Formular schickt ABSOLUTE Werte (die relative Frist/
  // Terminierung rechnet es clientseitig um); der Service kennt alle Geschäftsregeln, die Route mappt
  // nur 1:1 in den Patch. `null` = Feld löschen, wie in `updateLockRequest` dokumentiert.
  if (body.action === "edit") {
    const endsAt = new Date(body.endsAt);
    if (Number.isNaN(endsAt.getTime())) return errorResponse(400, "INVALID_DATETIME");

    let lockEndsAt: Date | null = null;
    if (body.lockEndsAt != null) {
      lockEndsAt = new Date(body.lockEndsAt);
      if (Number.isNaN(lockEndsAt.getTime())) return errorResponse(400, "INVALID_DATETIME");
    }

    let wirksamAb: Date | null = null;
    if (body.wirksamAb != null) {
      wirksamAb = new Date(body.wirksamAb);
      if (Number.isNaN(wirksamAb.getTime())) return errorResponse(400, "INVALID_DATETIME");
    }

    const result = await updateLockRequest(id, {
      message: body.message ?? null,
      endsAt,
      minDurationHours: body.minDurationHours ?? null,
      lockEndsAt,
      deviceId: body.deviceId ?? null,
      cleaningAllowed: !!body.cleaningAllowed,
      wirksamAb,
    }, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  }

  // setEnd: extend/shorten an active Sperrzeit. indefinite=true → open-ended; else endsAt (ISO).
  if (body.action === "setEnd") {
    const endsAt = body.indefinite ? null : new Date(body.endsAt);
    if (!body.indefinite && Number.isNaN(endsAt!.getTime())) {
      return errorResponse(400, "INVALID_DATETIME");
    }
    const result = await updateLockPeriodEnd(id, endsAt, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  }

  return errorResponse(400, "UNKNOWN_ACTION");
}
