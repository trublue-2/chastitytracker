import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";

const VALID_PLATFORMS = ["ios", "android"] as const;

export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { token, platform } = body as { token?: string; platform?: string };

  if (!token || !platform || !VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    return NextResponse.json({ error: "token and platform (ios|android) required" }, { status: 400 });
  }

  // M17: Hijack verhindern — gehört dieser Token bereits einem ANDEREN Konto, nicht umhängen.
  const existing = await prisma.nativePushToken.findUnique({ where: { token }, select: { userId: true } });
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Token belongs to another account" }, { status: 409 });
  }

  await prisma.nativePushToken.upsert({
    where: { token },
    create: { userId: session.user.id, token, platform },
    update: { userId: session.user.id, platform },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { token } = (await req.json().catch(() => ({}))) as { token?: string };

  // Mit Token: gezielt dieses Gerät abmelden. Ohne Token (z.B. Bestands-Registrierung ohne lokal
  // gespeicherten Token): ALLE Native-Tokens dieses Nutzers entfernen, damit „Push aus" zuverlässig
  // greift.
  await prisma.nativePushToken.deleteMany({
    where: { userId: session.user.id, ...(token ? { token } : {}) },
  });

  return NextResponse.json({ ok: true });
}
