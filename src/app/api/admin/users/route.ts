import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: { id: true, username: true },
  });

  const usersWithStatus = await Promise.all(
    users.map(async (u) => {
      const latest = await prisma.entry.findFirst({
        where: { userId: u.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
        orderBy: { startTime: "desc" },
        select: { type: true },
      });
      return { id: u.id, username: u.username, isLocked: latest?.type === "VERSCHLUSS" };
    })
  );

  return NextResponse.json(usersWithStatus);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password, role, email } = await req.json();

  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Passwort zu kurz (min. 8 Zeichen)" }, { status: 400 });
  }

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
