import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/constants";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json();
  const trimmed = typeof email === "string" ? email.trim() : "";
  const value = trimmed || null;

  if (!isValidEmail(value)) {
    return NextResponse.json({ error: "emailInvalid" }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: value },
    });
  } catch (e: unknown) {
    if (isUniqueConstraintOn(e, "email")) {
      return NextResponse.json({ error: "emailTaken" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
