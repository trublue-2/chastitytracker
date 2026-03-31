import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";
import { verifyKontrolleCode } from "@/lib/verifyCode";

const VALID_TYPES = ["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS"];
const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"];
const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"];

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // verifikationStatus is never accepted from client – set server-side only
  const { type, startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode } = body;

  if (!startTime) return NextResponse.json({ error: "startTime is required" }, { status: 400 });
  if (new Date(startTime) > new Date()) {
    return NextResponse.json({ error: "Zeitpunkt darf nicht in der Zukunft liegen" }, { status: 400 });
  }
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Ungültiger Typ" }, { status: 400 });
  }
  if (type === "OEFFNEN") {
    if (!oeffnenGrund || !OEFFNEN_GRUENDE.includes(oeffnenGrund)) {
      return NextResponse.json({ error: "Grund der Öffnung ist erforderlich" }, { status: 400 });
    }
    if (!note?.trim()) {
      return NextResponse.json({ error: "Kommentar ist erforderlich" }, { status: 400 });
    }
  }
  if (type === "PRUEFUNG" && !imageUrl) {
    return NextResponse.json({ error: "Foto ist bei Kontrolle zwingend" }, { status: 400 });
  }
  const orgasmusArtBase = orgasmusArt?.split(" – ")[0];
  if (type === "ORGASMUS" && !ORGASMUS_ARTEN.includes(orgasmusArtBase)) {
    return NextResponse.json({ error: "Ungültige Art" }, { status: 400 });
  }

  // Wrap state-check + create in a transaction to prevent TOCTOU races
  let entry: Awaited<ReturnType<typeof prisma.entry.create>>;
  try {
    entry = await prisma.$transaction(async (tx) => {
      if (type === "VERSCHLUSS") {
        const latest = await tx.entry.findFirst({
          where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (latest?.type === "VERSCHLUSS") throw Object.assign(new Error(), { _code: "ALREADY_LOCKED" });
        if (latest?.type === "OEFFNEN" && new Date(startTime) <= latest.startTime) {
          throw Object.assign(new Error(), { _code: "TIME_BEFORE" });
        }
      }
      if (type === "OEFFNEN") {
        const latest = await tx.entry.findFirst({
          where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (!latest || latest.type !== "VERSCHLUSS") throw Object.assign(new Error(), { _code: "NOT_LOCKED" });
        if (new Date(startTime) <= latest.startTime) throw Object.assign(new Error(), { _code: "TIME_BEFORE" });
      }

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
          verifikationStatus: null,
        },
      });

      // KontrollAnforderung verknüpfen + fulfilledAt server-seitig setzen (unveränderlich)
      if (type === "PRUEFUNG" && kontrollCode) {
        await tx.kontrollAnforderung.updateMany({
          where: { userId: session.user.id, code: kontrollCode, entryId: null, withdrawnAt: null },
          data: { entryId: created.id, fulfilledAt: new Date() },
        });
      }

      // VerschlussAnforderung (ANFORDERUNG) als erfüllt markieren + ggf. SPERRZEIT erstellen
      if (type === "VERSCHLUSS") {
        const offeneAnforderung = await tx.verschlussAnforderung.findFirst({
          where: { userId: session.user.id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
        });
        if (offeneAnforderung) {
          await tx.verschlussAnforderung.update({
            where: { id: offeneAnforderung.id },
            data: { fulfilledAt: new Date() },
          });
          if (offeneAnforderung.dauerH) {
            await tx.verschlussAnforderung.create({
              data: {
                userId: session.user.id,
                art: "SPERRZEIT",
                nachricht: offeneAnforderung.nachricht,
                endetAt: new Date(Date.now() + offeneAnforderung.dauerH * 60 * 60 * 1000),
              },
            });
          }
        }
      }

      return created;
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "ALREADY_LOCKED") return NextResponse.json({ error: "Verschluss nur möglich wenn aktuell offen" }, { status: 400 });
    if (code === "NOT_LOCKED") return NextResponse.json({ error: "Öffnen nur möglich wenn aktuell verschlossen" }, { status: 400 });
    if (code === "TIME_BEFORE") return NextResponse.json({ error: "Zeitpunkt muss nach dem vorherigen Eintrag liegen" }, { status: 400 });
    throw e;
  }

  if (type === "PRUEFUNG" && kontrollCode) {
    trackEvent("kontrolle.fulfilled", { type });
  } else {
    trackEvent(`entry.created.${type}` as Parameters<typeof trackEvent>[0]);
  }

  // Server-side AI verification for PRUEFUNG entries — never trusted from client
  if (type === "PRUEFUNG" && imageUrl && kontrollCode) {
    const status = await verifyKontrolleCode(imageUrl, kontrollCode);
    if (status) {
      await prisma.entry.update({ where: { id: entry.id }, data: { verifikationStatus: status } });
      entry = { ...entry, verifikationStatus: status };
    }
  }

  return NextResponse.json(entry, { status: 201 });
}
