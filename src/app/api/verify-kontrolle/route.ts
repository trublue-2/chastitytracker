import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";
import { deriveSealCode } from "@/lib/kontrolleService";
import { getLatestKgEntry } from "@/lib/queries";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl, VALID_ROTATIONS, type Rotation } from "@/lib/constants";
import { structuredLog } from "@/lib/serverLog";

const log = (label: string, fields: Record<string, unknown>) => structuredLog("verify", label, fields);

export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

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

  // Aktive Siegel-Nummer server-seitig ableiten (nie vom Client): bei aktivem Siegel prüft die
  // Vision Kontroll-Code UND Siegel-Nummer im selben Foto (Dual-Prüfung).
  const sealCode = deriveSealCode(await getLatestKgEntry(session.user.id));

  // route:start sorgt fuer User-Correlation; das ergebnis-Log (inkl. sealChecked) macht
  // verifyKontrolleCodeDetailed selbst (verify:vision_call/verify:result), keine Doppelung hier.
  const safeRotation: Rotation = VALID_ROTATIONS.includes(rotation) ? rotation : 0;
  log("route:start", { user: session.user.id, codeLen: expectedCode.length, rotation: safeRotation });
  const result = await verifyKontrolleCodeDetailed(imageUrl, expectedCode, safeRotation, sealCode);
  if (result === null) {
    return NextResponse.json({ detected: null, match: false, error: true });
  }

  return NextResponse.json(result);
}
