import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { notifyUser } from "@/lib/notify";
import { strafeVerhaengtNotice, STORED_TYPE, entryIdFromCleaningNotRelockedRef, judgmentStatus, checkPenaltyText } from "@/lib/strafurteilService";

const VALID_OFFENSE_TYPES = new Set(Object.values(STORED_TYPE));

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, offenseType, refId, bestraftDatum, notiz, reason } = body;
  // action: "punish" (bestraft, default) | "dismiss" (verworfen / keine Strafe)
  const action: "punish" | "dismiss" = body.status === "DISMISSED" ? "dismiss" : "punish";
  const status = judgmentStatus(action);

  if (!userId || !offenseType || !refId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  // Geteilte Regel mit judgeOffense (MCP) — punish verlangt Freitext, dismiss darf leer sein.
  if (checkPenaltyText(action, reason)) {
    return NextResponse.json({ error: "Missing penalty text" }, { status: 400 });
  }

  const err = await requireKeyholderOrAdminApi(userId);
  if (err) return err;
  if (!VALID_OFFENSE_TYPES.has(offenseType)) {
    return NextResponse.json({ error: "Invalid offenseType" }, { status: 400 });
  }

  // IDOR check: verify the referenced record belongs to userId
  // AUTO_ENTFERNT's refId is a KontrollAnforderung.id too (see collectDetectedOffenses), not an
  // Entry.id — same lookup as KONTROLLANFORDERUNG, else it would wrongly fall into the Entry branch.
  if (offenseType === "KONTROLLANFORDERUNG" || offenseType === "AUTO_ENTFERNT") {
    const ka = await prisma.kontrollAnforderung.findUnique({ where: { id: refId } });
    if (!ka || ka.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (offenseType === "VERSCHLUSS_ANFORDERUNG") {
    const va = await prisma.verschlussAnforderung.findUnique({ where: { id: refId } });
    if (!va || va.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (offenseType === "ORGASMUS_ANWEISUNG") {
    const oa = await prisma.orgasmusAnforderung.findUnique({ where: { id: refId } });
    if (!oa || oa.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (offenseType === "REINIGUNG_NICHT_VERSCHLOSSEN") {
    // refId is "relock:<entryId>" — shares its entry with REINIGUNG_LIMIT, see cleaningNotRelockedRef.
    const entryId = entryIdFromCleaningNotRelockedRef(refId);
    const entry = entryId ? await prisma.entry.findUnique({ where: { id: entryId } }) : null;
    if (!entry || entry.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else {
    const entry = await prisma.entry.findUnique({ where: { id: refId } });
    if (!entry || entry.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rely on @unique constraint on refId — catch P2002 for clean error
  try {
    const record = await prisma.strafeRecord.create({
      data: {
        userId,
        offenseType,
        refId,
        status,
        bestraftDatum: bestraftDatum ? new Date(bestraftDatum + "T12:00:00Z") : new Date(),
        notiz: notiz?.trim() || null,
        reason: reason?.trim() || null,
        judgedBy: "admin",
      },
    });
    // Konsistent zur MCP (judgeOffense): bei verhängter Strafe den Nutzer benachrichtigen.
    if (status === "PUNISHED") await notifyUser(userId, strafeVerhaengtNotice(reason?.trim() || null));
    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    if (isUniqueConstraintOn(e, "refId")) {
      return NextResponse.json({ error: "Already judged" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(req: Request) {
  const { refId } = await req.json();
  if (!refId) return NextResponse.json({ error: "Missing refId" }, { status: 400 });

  const record = await prisma.strafeRecord.findUnique({ where: { refId } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const err = await requireKeyholderOrAdminApi(record.userId);
  if (err) return err;

  await prisma.strafeRecord.delete({ where: { refId } });
  return NextResponse.json({ ok: true });
}

// Strafe als erledigt / wieder offen markieren (schließt bzw. öffnet den Loop).
export async function PATCH(req: Request) {
  const { refId, done } = await req.json();
  if (!refId) return NextResponse.json({ error: "Missing refId" }, { status: 400 });

  const record = await prisma.strafeRecord.findUnique({ where: { refId } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "PUNISHED") return NextResponse.json({ error: "Only a penalty can be completed" }, { status: 400 });

  const err = await requireKeyholderOrAdminApi(record.userId);
  if (err) return err;

  await prisma.strafeRecord.update({ where: { refId }, data: { erledigtAt: done === false ? null : new Date() } });
  return NextResponse.json({ ok: true });
}
