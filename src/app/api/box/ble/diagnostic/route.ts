import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/authGuards";
import { lockmeboxEnabled } from "@/lib/constants";
import { errorResponse } from "@/lib/serviceResult";
import { structuredLog } from "@/lib/serverLog";
import { LOCKMEBOX_NAME_RE } from "@/lib/lockmeboxProtocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  boxId: z.string().regex(LOCKMEBOX_NAME_RE),
  reason: z.literal("keyRejected"),
});

// POST /api/box/ble/diagnostic — das Handy meldet, was nur der Betreiber wissen soll. Die Oberfläche
// sagt dem Träger bewusst nur „keine Kommunikation möglich"; die Ursache steht im Container-Log.
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!lockmeboxEnabled()) return errorResponse(404, "NOT_FOUND");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "BOX_BLE_BAD_STATUS");

  structuredLog("lockmebox", "KEY_REJECTED", {
    userId: session.user.id,
    boxId: parsed.data.boxId,
    detail: "Die Box meldet sich beim Verbinden, ignoriert aber die verschluesselten Befehle. "
      + "BLE_BRIDGE_KEY der Instanz stimmt nicht mit dem AES-Schluessel der Box-Firmware ueberein "
      + "(kein selbst erzeugter Wert, siehe README: LockMeBox over Bluetooth).",
  });
  return NextResponse.json({ ok: true });
}
