import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi, requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { lockmeboxEnabled } from "@/lib/constants";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { LOCKMEBOX_COMMANDS, LOCKMEBOX_NAME_RE } from "@/lib/lockmeboxProtocol";
import { lockmeboxRelayStep } from "@/lib/lockmeboxService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Die Form steht als `LockmeboxRelayInput` im Protokoll-Modul.
const schema = z.object({
  boxId: z.string().regex(LOCKMEBOX_NAME_RE),
  line: z.string().max(300).nullable(),
  sent: z.enum(LOCKMEBOX_COMMANDS).nullable(),
});

// POST /api/box/ble — ein Schritt der Handy-Brücke zur LockMeBox (`lockmeboxService.ts`) für die Box
// des angemeldeten Trägers: das Handy steht an seiner Box.
//
// `?userId=` schaltet wie bei `GET /api/box` auf die KEYHOLDER-Sicht: dasselbe für die Box eines Subs,
// vom Handy der Keyholderin aus (Sub-Einstellungen → „Box"). Ohne den Parameter bleibt die Route
// selbst-bezogen, der Guard greift nur auf dem fremden Pfad.
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!lockmeboxEnabled()) return errorResponse(404, "NOT_FOUND");
  // `||` wie in `/api/box`: ein leerer Parameter fällt auf die Selbst-Sicht.
  const userId = req.nextUrl.searchParams.get("userId") || session.user.id;
  if (userId !== session.user.id) {
    const denied = await requireKeyholderOrAdminApi(userId);
    if (denied) return denied;
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "BOX_BLE_BAD_STATUS");

  const result = await lockmeboxRelayStep(userId, parsed.data);
  return result.ok ? NextResponse.json(result.data) : serviceFailure(result);
}
