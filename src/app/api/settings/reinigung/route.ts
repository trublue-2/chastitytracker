import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reinigungErlaubt, reinigungMaxMinuten } = await req.json();
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      reinigungErlaubt: Boolean(reinigungErlaubt),
      reinigungMaxMinuten: Math.max(1, Math.min(120, Number(reinigungMaxMinuten) || 15)),
    },
  });
  return NextResponse.json({ ok: true });
}
