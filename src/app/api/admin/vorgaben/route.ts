import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { requireAdminApi } from "@/lib/authGuards";

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const { userId, categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } =
    await req.json();

  if (!userId || !gueltigAb) {
    return NextResponse.json({ error: "userId und gueltigAb sind erforderlich" }, { status: 400 });
  }
  if (!minProTagH && !minProWocheH && !minProMonatH) {
    return NextResponse.json({ error: "Mindestens ein Zeitwert ist erforderlich" }, { status: 400 });
  }
  if (categoryId !== undefined && categoryId !== null) {
    if (typeof categoryId !== "string") return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
    const cat = await prisma.deviceCategory.findUnique({
      where: { id: categoryId },
      select: { userId: true, allowVorgaben: true, isBuiltIn: true },
    });
    if (!cat || cat.userId !== userId) return NextResponse.json({ error: "Ungültige Kategorie" }, { status: 400 });
    // Built-in (KG) always allows vorgaben; user-defined respects the toggle.
    if (!cat.isBuiltIn && !cat.allowVorgaben) {
      return NextResponse.json({ error: "Diese Kategorie erlaubt keine Trainingsvorgaben" }, { status: 400 });
    }
  }

  const vorgabe = await prisma.trainingVorgabe.create({
    data: {
      userId,
      categoryId: categoryId || null,
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
