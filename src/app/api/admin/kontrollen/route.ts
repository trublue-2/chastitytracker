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
    include: {
      user: { select: { username: true } },
      entry: true,
    },
  });

  return NextResponse.json(kontrollen);
}
