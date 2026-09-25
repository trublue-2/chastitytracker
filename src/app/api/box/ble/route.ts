import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/authGuards";
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

// POST /api/box/ble — ein Schritt der Handy-Brücke zur LockMeBox (`lockmeboxService.ts`). Nur für
// die EIGENE Box: das Handy steht an der Box des angemeldeten Trägers.
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!lockmeboxEnabled()) return errorResponse(404, "NOT_FOUND");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "BOX_BLE_BAD_STATUS");

  const result = await lockmeboxRelayStep(session.user.id, parsed.data);
  return result.ok ? NextResponse.json(result.data) : serviceFailure(result);
}
