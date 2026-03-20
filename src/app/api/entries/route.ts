import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const { type, startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, aiVerified } = body;

  if (!startTime) return NextResponse.json({ error: "startTime is required" }, { status: 400 });
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Ungültiger Typ" }, { status: 400 });
  }
  if (type === "VERSCHLUSS") {
    const latest = await prisma.entry.findFirst({
      where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    });
    if (latest?.type === "VERSCHLUSS") {
      return NextResponse.json({ error: "Verschluss nur möglich wenn aktuell offen" }, { status: 400 });
    }
    // Neue Verschluss-Zeit muss nach der letzten Öffnung liegen
    if (latest?.type === "OEFFNEN" && new Date(startTime) <= latest.startTime) {
      return NextResponse.json({ error: "Verschlusszeit muss nach der letzten Öffnungszeit liegen" }, { status: 400 });
    }
  }
  if (type === "OEFFNEN") {
    if (!oeffnenGrund || !OEFFNEN_GRUENDE.includes(oeffnenGrund)) {
      return NextResponse.json({ error: "Grund der Öffnung ist erforderlich" }, { status: 400 });
    }
    if (!note?.trim()) {
      return NextResponse.json({ error: "Kommentar ist erforderlich" }, { status: 400 });
    }
    const latest = await prisma.entry.findFirst({
      where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    });
    if (!latest || latest.type !== "VERSCHLUSS") {
      return NextResponse.json({ error: "Öffnen nur möglich wenn aktuell verschlossen" }, { status: 400 });
    }
    // Neue Öffnungs-Zeit muss nach dem letzten Verschluss liegen
    if (new Date(startTime) <= latest.startTime) {
      return NextResponse.json({ error: "Öffnungszeit muss nach der letzten Verschlusszeit liegen" }, { status: 400 });
    }
  }
  if (type === "PRUEFUNG" && !imageUrl) {
    return NextResponse.json({ error: "Foto ist bei Kontrolle zwingend" }, { status: 400 });
  }
  const orgasmusArtBase = orgasmusArt?.split(" – ")[0];
  if (type === "ORGASMUS" && !ORGASMUS_ARTEN.includes(orgasmusArtBase)) {
    return NextResponse.json({ error: "Ungültige Art" }, { status: 400 });
  }

  const entry = await prisma.entry.create({
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
      aiVerified: aiVerified !== undefined ? Boolean(aiVerified) : null,
    },
  });

  // Kontroll-Anforderung als erfüllt markieren
  if (type === "PRUEFUNG" && kontrollCode) {
    await prisma.kontrollAnforderung.updateMany({
      where: { userId: session.user.id, code: kontrollCode, fulfilledAt: null },
      data: { fulfilledAt: new Date() },
    });
  }

  // VerschlussAnforderung (ANFORDERUNG) als erfüllt markieren + ggf. SPERRZEIT erstellen
  if (type === "VERSCHLUSS") {
    const offeneAnforderung = await prisma.verschlussAnforderung.findFirst({
      where: { userId: session.user.id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    });
    if (offeneAnforderung) {
      await prisma.verschlussAnforderung.update({
        where: { id: offeneAnforderung.id },
        data: { fulfilledAt: new Date() },
      });
      // Falls Mindestdauer definiert → automatisch SPERRZEIT erstellen
      if (offeneAnforderung.dauerH) {
        await prisma.verschlussAnforderung.create({
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

  return NextResponse.json(entry, { status: 201 });
}
