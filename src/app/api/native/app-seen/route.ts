import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { isNativePlatformName } from "@/lib/nativePlatforms";

/** Was die App von sich meldet: kurze, harmlose Kennungen — nichts, was in einer Liste stören kann. */
const TOKEN_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Die App meldet sich (`NativeAppReporter`): Plattform, Version, Build und ihre Installations-ID.
 * Daraus entsteht je Nutzer und Gerät eine Zeile — die Grundlage dafür, dass das Portal sieht, wer
 * die App nutzt. Ein Browser ruft hier nie an; gezählt wird nur, was die App selbst schickt.
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { platform, installId, version, build } = body;
  if (
    !isNativePlatformName(platform) ||
    ![installId, version, build].every((v) => typeof v === "string" && TOKEN_RE.test(v))
  ) {
    return NextResponse.json({ error: "invalidAppInfo" }, { status: 400 });
  }

  const data = { platform, appVersion: version as string, appBuild: build as string, lastSeenAt: new Date() };
  const where = { userId_installId: { userId: session.user.id, installId: installId as string } };
  const upsert = () => prisma.nativeAppClient.upsert({
    where,
    create: { userId: session.user.id, installId: installId as string, ...data },
    update: data,
  });
  // Zwei gleichzeitige Erstmeldungen desselben Geräts: die zweite scheitert am Unique-Index, die
  // Zeile steht dann aber schon — einmal wiederholen macht daraus ein Update.
  await upsert().catch((e: { code?: string }) => {
    if (e?.code === "P2002") return upsert();
    throw e;
  });
  return NextResponse.json({ ok: true });
}
