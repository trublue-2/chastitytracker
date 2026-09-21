import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prepareEmailInput } from "@/lib/loginIdentity";
import { requireAdminApi } from "@/lib/authGuards";
import bcrypt from "bcryptjs";
import { passwordErrorCode } from "@/lib/constants";
import { ensureKgCategory } from "@/lib/deviceCategories";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { latestKgTimesByUser } from "@/lib/queries";

export async function GET() {
  const err = await requireAdminApi();
  if (err) return err;

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: { id: true, username: true, role: true },
  });

  // Two aggregate queries instead of one per user.
  const userIds = users.map((u) => u.id);
  const { lockedAt: vMap, openedAt: oMap } = await latestKgTimesByUser(userIds);
  const usersWithStatus = users.map((u) => {
    const vTime = vMap.get(u.id);
    const oTime = oMap.get(u.id);
    return { id: u.id, username: u.username, role: u.role, isLocked: !!vTime && (!oTime || vTime > oTime) };
  });

  return NextResponse.json(usersWithStatus);
}

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const { username, password, role, email } = await req.json();

  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "usernameRequired" }, { status: 400 });
  }
  if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50) {
    return NextResponse.json({ error: "usernameLength" }, { status: 400 });
  }
  const pwErr = passwordErrorCode(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const prepared = await prepareEmailInput(email, null);
  if ("error" in prepared) return NextResponse.json({ error: prepared.error }, { status: prepared.status });

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        // Gespeichert GETRIMMT, wie geprüft — bis 6.2.4 wurde nur die Länge am getrimmten Wert
        // gemessen, gespeichert aber der rohe; so entstanden Benutzernamen mit Leerzeichen am Rand,
        // die niemand so eintippt.
        username: username.trim(),
        passwordHash,
        role: role === "admin" ? "admin" : "user",
        ...(prepared.value ? { email: prepared.value } : {}),
      },
    });
  } catch (err) {
    if (isUniqueConstraintOn(err, "username")) {
      return NextResponse.json({ error: "usernameTaken" }, { status: 409 });
    }
    if (isUniqueConstraintOn(err, "email")) {
      return NextResponse.json({ error: "emailTaken" }, { status: 409 });
    }
    throw err;
  }
  await ensureKgCategory(user.id);

  return NextResponse.json({ id: user.id, username: user.username, role: user.role }, { status: 201 });
}
