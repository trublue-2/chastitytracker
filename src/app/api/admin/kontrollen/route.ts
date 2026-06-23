import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";
import { aktiveKontrolleWhere } from "@/lib/queries";

export async function GET() {
  const err = await requireAdminApi();
  if (err) return err;

  const kontrollen = await prisma.kontrollAnforderung.findMany({
    where: aktiveKontrolleWhere(), // noch nicht aktive (geplante) Kontrollen ausblenden
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true } },
      entry: true,
    },
  });

  return NextResponse.json(kontrollen);
}
