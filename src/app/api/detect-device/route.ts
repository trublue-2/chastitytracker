import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl } from "@/lib/constants";
import { detectDevice } from "@/lib/detectDevice";
import { gatherDeviceReferences } from "@/lib/deviceReferenceService";

/**
 * POST /api/detect-device
 *
 * Identifies which of the user's active devices appears in the uploaded photo.
 * Combines device reference images and recent Verschluss entry photos as references.
 *
 * Special case: if the user has exactly one active device, returns it directly
 * without a Claude Vision call.
 *
 * Body: { imageUrl: string }
 * Response: { deviceId: string | null, deviceName: string | null }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`detect-device:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await req.json();
  const { imageUrl } = body as { imageUrl?: unknown };
  if (!imageUrl || typeof imageUrl !== "string" || !isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
  }

  // Referenzen je aktivem KG-Gerät (kuratiert bevorzugt, sonst Heuristik) — geteilte Sammlung.
  const references = await gatherDeviceReferences(session.user.id);

  // Keine Geräte → nichts zu erkennen.
  if (references.length === 0) {
    return NextResponse.json({ deviceId: null, deviceName: null });
  }
  // Genau ein Gerät: kein Vision-Call nötig.
  if (references.length === 1) {
    return NextResponse.json({ deviceId: references[0].deviceId, deviceName: references[0].deviceName });
  }

  const result = await detectDevice(imageUrl, references);
  return NextResponse.json({
    deviceId: result?.deviceId ?? null,
    deviceName: result?.deviceName ?? null,
  });
}
