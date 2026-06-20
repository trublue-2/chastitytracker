import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectSealNumber, detectLockboxCode } from "@/lib/verifyCode";
import { localCodeReadable } from "@/lib/imageReadability";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl, VALID_ROTATIONS, type Rotation } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`user:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const { imageUrl, rotation, readableOnly, lockbox } = await req.json();
  if (!imageUrl || !isValidImageUrl(imageUrl)) return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });

  const safeRotation: Rotation = VALID_ROTATIONS.includes(rotation) ? rotation : 0;

  // Bildersafe-Lesbarkeit: LOKALE Schärfeprüfung (kein KI, kein Datenabfluss). Die Zahl verlässt
  // den Server NICHT — wir geben nur scharf/unscharf zurück.
  if (readableOnly) {
    return NextResponse.json({ readable: await localCodeReadable(imageUrl, safeRotation) });
  }

  // Tatsächliche Ziffern-Erkennung (Geräte-Siegel) — braucht KI; ohne API-Key entfällt sie.
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ detected: null });
  // lockbox=true → Zahlen-Vorhängeschloss / Schlüsselbox (3–8 Ziffern), sonst Plombe (5–8).
  const detected = lockbox
    ? await detectLockboxCode(imageUrl, safeRotation)
    : await detectSealNumber(imageUrl, safeRotation);
  return NextResponse.json({ detected });
}
