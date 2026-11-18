import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/authGuards";
import { firmwareSwapEnabled } from "@/lib/constants";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { isValidSwapWifi, LOCKMEBOX_NAME_RE } from "@/lib/lockmeboxProtocol";
import { firmwareSwapProgress, startFirmwareSwap } from "@/lib/firmwareSwapService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({ boxId: z.string().regex(LOCKMEBOX_NAME_RE), ssid: z.string(), password: z.string() })
  .refine((b) => isValidSwapWifi(b.ssid, b.password));

// POST /api/box/ble/firmware — die eigene LockMeBox auf Heimdall umstellen (`firmwareSwapService.ts`).
// Antwort: der Update-Befehl, den das Handy an die Box schreibt, und was der Setup-Link braucht.
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!firmwareSwapEnabled()) return errorResponse(404, "NOT_FOUND");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "BOX_SWAP_BAD_WIFI");

  const result = await startFirmwareSwap(session.user.id, parsed.data);
  return result.ok ? NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } }) : serviceFailure(result);
}

// GET /api/box/ble/firmware?device=<id> — wie weit ist der Wechsel?
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!firmwareSwapEnabled()) return errorResponse(404, "NOT_FOUND");

  const deviceId = req.nextUrl.searchParams.get("device");
  if (!deviceId || !/^[a-z0-9]{1,40}$/i.test(deviceId)) return errorResponse(404, "NOT_FOUND");

  const result = await firmwareSwapProgress(session.user.id, deviceId);
  return result.ok ? NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } }) : serviceFailure(result);
}
