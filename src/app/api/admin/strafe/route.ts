import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { notifyUser } from "@/lib/notify";
import { strafeVerhaengtNotice, STORED_TYPE, judgmentStatus, checkPenaltyText, judgeOffense, collectDetectedOffenses } from "@/lib/strafurteilService";
import { markLastAction } from "@/lib/appMeta";
import { buildStrafbuch } from "@/lib/strafbuch";

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

  // Die EINE Schranke statt einer Kette von Sonderfällen: `requireDetectedOffense` wertet das
  // ganze Strafbuch aus und beantwortet „gehört diese refId zu einem aktuell ERKANNTEN Vergehen
  // dieses Subs?" für alle Arten auf einmal — über `collectDetectedOffenses` → `OFFENSE_LISTS`.
  //
  // Vorher stand hier eine `else if`-Kette mit einer Abfrage je Art. Sie war schwächer (sie prüfte
  // nur „Datensatz gehört dem User", nicht „ist überhaupt ein Vergehen") und musste bei JEDER neuen
  // Art erweitert werden — wurde sie vergessen, fiel die Art in den Entry-Zweig und war im Browser
  // grundsätzlich nicht beurteilbar (404 auf „Wurde bestraft" und „Verwerfen"), ohne dass ein
  // Compiler oder Test etwas gesagt hätte. Genau das ist mit MANUAL_OFFENSE passiert. Der MCP-Weg
  // (`judgeOffense`) und `punishWithTask` gingen immer schon hier durch; DELETE weiter unten auch.
  // ALLE Arten zu dieser refId, nicht nur die erste: zwei Arten können sich eine refId teilen —
  // `unauthorized_opening` und `cleaning_limit` sind beide die `Entry.id` derselben OEFFNEN-Zeile,
  // und eine Reinigungsöffnung über dem Kontingent während einer Sperrzeit ohne Reinigungserlaubnis
  // ist beides. Gegen nur die erste geprüft, liesse sich die zweite Sektion nicht mehr beurteilen.
  const detected = collectDetectedOffenses(await buildStrafbuch(userId, new Date()))
    .filter((o) => o.refId === refId);
  if (detected.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // `offenseType` aus dem Body ist damit nur noch eine Behauptung, die geprüft wird — der Client
  // kann die Art nicht mehr danebenlegen.
  if (!detected.some((o) => o.offenseType === offenseType)) {
    return NextResponse.json({ error: "Invalid offenseType" }, { status: 400 });
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
    if (status === "PUNISHED") await notifyUser(userId, strafeVerhaengtNotice(reason?.trim() || null, record.id, "admin"));
    markLastAction();
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

  // Über `judgeOffense` statt mit einem eigenen `delete`: die Rücknahme zieht auch die Strafaufgabe
  // zurück, die am Urteil hängt. Von Hand gelöscht bliebe sie beim Sub stehen — die App forderte
  // weiter eine Strafe ein, die es nicht mehr gibt, und ihr Verstreichen wäre später ein neues
  // Vergehen. Genau diese Regel galt bisher nur auf dem MCP-Weg, während der Knopf hier daran vorbeilief.
  const result = await judgeOffense({ userId: record.userId, refId, action: "reopen", judgedBy: "admin" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
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
