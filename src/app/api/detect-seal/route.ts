import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectSealNumber } from "@/lib/verifyCode";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl, VALID_ROTATIONS, type Rotation } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`user:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const { imageUrl, rotation, readableOnly } = await req.json();
  if (!imageUrl || !isValidImageUrl(imageUrl)) return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });

  const safeRotation: Rotation = VALID_ROTATIONS.includes(rotation) ? rotation : 0;
  const detected = await detectSealNumber(imageUrl, safeRotation);
  // Bildersafe: nur Lesbarkeit zurückgeben — die Zahl verlässt den Server NICHT (Sub soll sie nicht sehen).
  if (readableOnly) return NextResponse.json({ readable: detected !== null });
  return NextResponse.json({ detected });
}
