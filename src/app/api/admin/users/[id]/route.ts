import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const now = new Date();

  const [user, latestLockEntry, offeneAnforderung, activeSperrzeit] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { username: true, email: true } }),
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
      select: { type: true },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", withdrawnAt: null, fulfilledAt: null },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: {
        userId: id, art: "SPERRZEIT", withdrawnAt: null,
        OR: [{ endetAt: null }, { endetAt: { gt: now } }],
      },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    username: user.username,
    email: user.email,
    isLocked: latestLockEntry?.type === "VERSCHLUSS",
    hasOffeneAnforderung: !!offeneAnforderung,
    hasActiveSperrzeit: !!activeSperrzeit,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body.password !== undefined) {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: "Passwort zu kurz (min. 8 Zeichen)" }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  }

  if (body.email !== undefined) {
    const email = body.email?.trim() || null;
    const user = await prisma.user.update({ where: { id }, data: { email } });
    return NextResponse.json({ id: user.id, email: user.email });
  }

  if (body.reinigungErlaubt !== undefined || body.reinigungMaxMinuten !== undefined) {
    const data: { reinigungErlaubt?: boolean; reinigungMaxMinuten?: number } = {};
    if (body.reinigungErlaubt !== undefined) data.reinigungErlaubt = Boolean(body.reinigungErlaubt);
    if (body.reinigungMaxMinuten !== undefined) data.reinigungMaxMinuten = Math.max(1, Math.min(120, Number(body.reinigungMaxMinuten) || 15));
    await prisma.user.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  }

  if (body.mobileDesktopUpload !== undefined) {
    await prisma.user.update({ where: { id }, data: { mobileDesktopUpload: Boolean(body.mobileDesktopUpload) } });
    return NextResponse.json({ ok: true });
  }

  if (!["admin", "user"].includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const user = await prisma.user.update({ where: { id }, data: { role: body.role } });
  return NextResponse.json({ id: user.id, role: user.role });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Eigenen Account kann man nicht löschen" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
