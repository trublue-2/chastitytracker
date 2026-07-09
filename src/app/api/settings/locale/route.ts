import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/constants";

// Locale is a USER-SELF field (the user's own UI + notification language). Per CLAUDE.md only
// admin-set fields need requireAdminApi() — normal session auth is correct here.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { locale } = await req.json();
  if (!isValidLocale(locale)) {
    return NextResponse.json({ error: "invalidLocale" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { locale },
  });

  return NextResponse.json({ ok: true });
}
