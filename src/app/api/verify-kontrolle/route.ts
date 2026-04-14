import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`user:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const { imageUrl, expectedCode, rotation } = await req.json();

  if (!imageUrl || !expectedCode) {
    return NextResponse.json({ error: "imageUrl and expectedCode required" }, { status: 400 });
  }
  if (!isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
  }

  const safeRotation: 0 | 90 | 180 | 270 = [0, 90, 180, 270].includes(rotation) ? rotation : 0;
  const result = await verifyKontrolleCodeDetailed(imageUrl, expectedCode, safeRotation);
  if (result === null) {
    return NextResponse.json({ detected: null, match: false, error: true });
  }

  return NextResponse.json(result);
}
