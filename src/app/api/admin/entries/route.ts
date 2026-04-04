import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";
import { VALID_TYPES, ORGASMUS_ARTEN, OEFFNEN_GRUENDE, isValidImageUrl, parseOrgasmusArtBase } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const body = await req.json();
  const { userId, type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode } = body;

  if (!isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Ungültige imageUrl" }, { status: 400 });
  }
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!startTime) return NextResponse.json({ error: "startTime is required" }, { status: 400 });
  if (new Date(startTime) > new Date()) {
    return NextResponse.json({ error: "Zeitpunkt darf nicht in der Zukunft liegen" }, { status: 400 });
  }
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Ungültiger Typ" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });

  if (type === "OEFFNEN") {
    if (!oeffnenGrund || !OEFFNEN_GRUENDE.includes(oeffnenGrund)) {
      return NextResponse.json({ error: "Grund der Öffnung ist erforderlich" }, { status: 400 });
    }
    if (!note?.trim()) {
      return NextResponse.json({ error: "Kommentar ist erforderlich" }, { status: 400 });
    }
  }

  const orgasmusArtBase = parseOrgasmusArtBase(orgasmusArt);
  if (type === "ORGASMUS" && !(ORGASMUS_ARTEN as readonly string[]).includes(orgasmusArtBase ?? "")) {
    return NextResponse.json({ error: "Ungültige Art" }, { status: 400 });
  }

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      if (type === "VERSCHLUSS") {
        const latest = await tx.entry.findFirst({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (latest?.type === "VERSCHLUSS") throw Object.assign(new Error(), { _code: "ALREADY_LOCKED" });
      }

      if (type === "OEFFNEN") {
        const latest = await tx.entry.findFirst({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (!latest || latest.type !== "VERSCHLUSS") throw Object.assign(new Error(), { _code: "NOT_LOCKED" });
      }

      return tx.entry.create({
        data: {
          userId,
          type,
          startTime: new Date(startTime),
          note: note?.trim() || null,
          oeffnenGrund: oeffnenGrund || null,
          orgasmusArt: orgasmusArt || null,
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          kontrollCode: kontrollCode || null,
        },
      });
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "ALREADY_LOCKED") return NextResponse.json({ error: "Verschluss nur möglich wenn aktuell offen" }, { status: 400 });
    if (code === "NOT_LOCKED") return NextResponse.json({ error: "Öffnen nur möglich wenn aktuell verschlossen" }, { status: 400 });
    throw e;
  }

  return NextResponse.json(entry, { status: 201 });
}
