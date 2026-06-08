import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdminApi, requireKeyholderOrAdminApi } from "@/lib/authGuards";
import bcrypt from "bcryptjs";
import { isValidEmail, validatePassword } from "@/lib/constants";
import { getActiveSperrzeit } from "@/lib/queries";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";
import { setReinigungSettings } from "@/lib/reinigungService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const err = await requireKeyholderOrAdminApi(id);
  if (err) return err;

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
    getActiveSperrzeit(id),
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
  const { id } = await params;
  const body = await req.json();

  const err =
    body.role !== undefined
      ? await requireAdminApi()
      : await requireKeyholderOrAdminApi(id);
  if (err) return err;

  if (body.password !== undefined) {
    const pwErr = validatePassword(body.password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  }

  if (body.email !== undefined) {
    const email = body.email?.trim() || null;
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    }
    try {
      const user = await prisma.user.update({ where: { id }, data: { email } });
      return NextResponse.json({ id: user.id, email: user.email });
    } catch (err) {
      if (isUniqueConstraintOn(err, "email")) {
        return NextResponse.json({ error: "E-Mail-Adresse bereits vergeben" }, { status: 409 });
      }
      throw err;
    }
  }

  if (body.reinigungErlaubt !== undefined || body.reinigungMaxMinuten !== undefined || body.reinigungMaxProTag !== undefined) {
    await setReinigungSettings(id, {
      erlaubt: body.reinigungErlaubt !== undefined ? Boolean(body.reinigungErlaubt) : undefined,
      maxMinuten: body.reinigungMaxMinuten !== undefined ? Number(body.reinigungMaxMinuten) : undefined,
      maxProTag: body.reinigungMaxProTag !== undefined ? Number(body.reinigungMaxProTag) : undefined,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.mobileDesktopUpload !== undefined) {
    await prisma.user.update({ where: { id }, data: { mobileDesktopUpload: Boolean(body.mobileDesktopUpload) } });
    return NextResponse.json({ ok: true });
  }

  if (body.mcpKeyholderInstructions !== undefined) {
    const text = typeof body.mcpKeyholderInstructions === "string" ? body.mcpKeyholderInstructions.trim() : "";
    await prisma.user.update({ where: { id }, data: { mcpKeyholderInstructions: text || null } });
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
  const err = await requireAdminApi();
  if (err) return err;

  const session = await auth();
  const { id } = await params;

  if (id === session!.user.id) {
    return NextResponse.json({ error: "Eigenen Account kann man nicht löschen" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
