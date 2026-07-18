import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { manageableDeviceOwner } from "@/lib/deviceAccess";
import { importRecentVerschluss } from "@/lib/deviceReferenceService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/devices/[id]/references/import-recent
 * Übernimmt die letzten N (Body.limit, Default 5, max 10) Verschluss-Fotos dieses Geräts als
 * Referenzen — Startbestand „Trainingsmaterial der letzten Wochen". Idempotent (per sourceEntryId).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const ownerId = await manageableDeviceOwner(id, session.user.id, session.user.role);
  if (!ownerId) return errorResponse(404, "NOT_FOUND");

  const body = await req.json().catch(() => ({}));
  const limit = typeof body.limit === "number" ? body.limit : 5;
  const result = await importRecentVerschluss(id, ownerId, limit);
  if (!result.ok) return serviceFailure(result);
  return NextResponse.json(result.data);
}
