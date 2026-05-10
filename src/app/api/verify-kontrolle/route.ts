import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl, VALID_ROTATIONS, type Rotation } from "@/lib/constants";
import { structuredLog } from "@/lib/serverLog";

const log = (label: string, fields: Record<string, unknown>) => structuredLog("verify", label, fields);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`user:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    log("route:rate_limited", { user: session.user.id, retryAfter: rl.retryAfter });
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const { imageUrl, expectedCode, rotation } = await req.json();

  if (!imageUrl || !expectedCode) {
    log("route:missing_params", { user: session.user.id, hasImage: !!imageUrl, hasCode: !!expectedCode });
    return NextResponse.json({ error: "imageUrl and expectedCode required" }, { status: 400 });
  }
  if (!isValidImageUrl(imageUrl)) {
    log("route:invalid_image_url", { user: session.user.id, imageUrl });
    return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
  }

  // route:start sorgt fuer User-Correlation; das ergebnis-Log macht
  // verifyKontrolleCodeDetailed selbst (verify:result), keine Doppelung hier.
  const safeRotation: Rotation = VALID_ROTATIONS.includes(rotation) ? rotation : 0;
  log("route:start", { user: session.user.id, codeLen: expectedCode.length, rotation: safeRotation });
  const result = await verifyKontrolleCodeDetailed(imageUrl, expectedCode, safeRotation);
  if (result === null) {
    return NextResponse.json({ detected: null, match: false, error: true });
  }

  return NextResponse.json(result);
}
