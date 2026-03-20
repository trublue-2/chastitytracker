import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const kontrollen = await prisma.kontrollAnforderung.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { username: true } } },
  });

  // Fetch associated PRUEFUNG entries for fulfilled kontrollen
  const fulfilled = kontrollen.filter((k) => k.fulfilledAt && k.code);
  const entries = fulfilled.length > 0
    ? await prisma.entry.findMany({
        where: {
          type: "PRUEFUNG",
          OR: fulfilled.map((k) => ({ userId: k.userId, kontrollCode: k.code })),
        },
        select: { userId: true, kontrollCode: true, aiVerified: true, id: true },
      })
    : [];

  const result = kontrollen.map((k) => {
    const entry = entries.find((e) => e.userId === k.userId && e.kontrollCode === k.code) ?? null;
    return { ...k, entry };
  });

  return NextResponse.json(result);
}
