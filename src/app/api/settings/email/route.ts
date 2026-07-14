import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/constants";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";

// Eigener Handler statt userSelfFieldRoute: trimmt auf null und mappt den Unique-Constraint
// auf 409 emailTaken — beides passt nicht in den generischen „validieren & schreiben"-Ablauf.
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

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
