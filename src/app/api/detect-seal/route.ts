import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectSealNumber, detectLockboxCode } from "@/lib/verifyCode";
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

  // KI optional: ohne ANTHROPIC_API_KEY findet KEINE Code-Erkennung statt. Für die Lesbarkeitsprüfung
  // (Bildersafe) bedeutet das „nicht geprüft" (readable: null) — NICHT „unlesbar". So bleibt Bildersafe
  // auch ohne KI nutzbar.
  if (!process.env.ANTHROPIC_API_KEY) {
    if (readableOnly) return NextResponse.json({ readable: null });
    return NextResponse.json({ detected: null });
  }

  const safeRotation: Rotation = VALID_ROTATIONS.includes(rotation) ? rotation : 0;
  // lockbox=true → Zahlen-Vorhängeschloss / Schlüsselbox (3–8 Ziffern), sonst Plombe (5–8).
  const detected = lockbox
    ? await detectLockboxCode(imageUrl, safeRotation)
    : await detectSealNumber(imageUrl, safeRotation);
  // Bildersafe: nur Lesbarkeit zurückgeben — die Zahl verlässt den Server NICHT (Sub soll sie nicht sehen).
  if (readableOnly) return NextResponse.json({ readable: detected !== null });
  return NextResponse.json({ detected });
}
