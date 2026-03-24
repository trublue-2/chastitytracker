import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } =
    await req.json();

  if (!userId || !gueltigAb) {
    return NextResponse.json({ error: "userId und gueltigAb sind erforderlich" }, { status: 400 });
  }
  if (!minProTagH && !minProWocheH && !minProMonatH) {
    return NextResponse.json({ error: "Mindestens ein Zeitwert ist erforderlich" }, { status: 400 });
  }

  const newGueltigAb = new Date(gueltigAb);

  const vorgabe = await prisma.trainingVorgabe.create({
    data: {
      userId,
      gueltigAb: newGueltigAb,
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      notiz: notiz || null,
    },
  });

  // Vorangegangene offene Vorgaben automatisch mit dem neuen Startdatum schliessen
  await prisma.trainingVorgabe.updateMany({
    where: { userId, id: { not: vorgabe.id }, gueltigBis: null },
    data: { gueltigBis: newGueltigAb },
  });

  return NextResponse.json(vorgabe, { status: 201 });
}
