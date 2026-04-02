import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { requireAdminApi } from "@/lib/authGuards";

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const { userId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } =
    await req.json();

  if (!userId || !gueltigAb) {
    return NextResponse.json({ error: "userId und gueltigAb sind erforderlich" }, { status: 400 });
  }
  if (!minProTagH && !minProWocheH && !minProMonatH) {
    return NextResponse.json({ error: "Mindestens ein Zeitwert ist erforderlich" }, { status: 400 });
  }

  const vorgabe = await prisma.trainingVorgabe.create({
    data: {
      userId,
      gueltigAb: new Date(gueltigAb),
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      notiz: notiz || null,
    },
  });

  await reorderVorgabenDates(userId);

  return NextResponse.json(vorgabe, { status: 201 });
}
