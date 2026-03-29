import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { mobileDesktopUpload } = await req.json();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { mobileDesktopUpload: Boolean(mobileDesktopUpload) },
  });
  return NextResponse.json({ ok: true });
}
