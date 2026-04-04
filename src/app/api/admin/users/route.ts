import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/constants";

export async function GET() {
  const err = await requireAdminApi();
  if (err) return err;

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: { id: true, username: true },
  });

  // Two aggregate queries instead of one per user.
  const userIds = users.map((u) => u.id);
  const [lastVerschluss, lastOeffnen] = await Promise.all([
    prisma.entry.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, type: "VERSCHLUSS" },
      _max: { startTime: true },
    }),
    prisma.entry.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, type: "OEFFNEN" },
      _max: { startTime: true },
    }),
  ]);
  const vMap = new Map(lastVerschluss.map((r) => [r.userId, r._max.startTime]));
  const oMap = new Map(lastOeffnen.map((r) => [r.userId, r._max.startTime]));
  const usersWithStatus = users.map((u) => {
    const vTime = vMap.get(u.id);
    const oTime = oMap.get(u.id);
    return { id: u.id, username: u.username, isLocked: !!vTime && (!oTime || vTime > oTime) };
  });

  return NextResponse.json(usersWithStatus);
}

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const { username, password, role, email } = await req.json();

  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }
  if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50) {
    return NextResponse.json({ error: "Benutzername muss 3–50 Zeichen haben" }, { status: 400 });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Benutzername bereits vergeben" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: role === "admin" ? "admin" : "user",
      ...(email?.trim() ? { email: email.trim() } : {}),
    },
  });

  return NextResponse.json({ id: user.id, username: user.username, role: user.role }, { status: 201 });
}
