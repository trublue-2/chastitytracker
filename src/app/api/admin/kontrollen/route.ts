import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";
import { keyholderVisibleKontrolleWhere } from "@/lib/queries";

export async function GET() {
  const err = await requireAdminApi();
  if (err) return err;

  const kontrollen = await prisma.kontrollAnforderung.findMany({
    where: keyholderVisibleKontrolleWhere(), // Keyholder-Sicht: manuell geplante zeigen, nur Auto-Zufalls-Kontrollen verbergen
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true } },
      entry: true,
    },
  });

  return NextResponse.json(kontrollen);
}
