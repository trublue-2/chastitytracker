import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";

export async function GET() {
  const err = await requireAdminApi();
  if (err) return err;

  const kontrollen = await prisma.kontrollAnforderung.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true } },
      entry: true,
    },
  });

  return NextResponse.json(kontrollen);
}
