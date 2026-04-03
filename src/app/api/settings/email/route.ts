import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/constants";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json();
  const trimmed = typeof email === "string" ? email.trim() : "";
  const value = trimmed || null;

  if (!isValidEmail(value)) {
    return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: value },
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "Diese E-Mail ist bereits vergeben" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
