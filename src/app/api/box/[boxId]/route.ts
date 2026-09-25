import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { boxCouplingEnabled } from "@/lib/constants";
import { errorResponse, serviceResponse } from "@/lib/serviceResult";
import { removeBox } from "@/lib/boxPairing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/box/<boxId> — die EIGENE Box entfernen, der Weg zum Box-Wechsel (eine Box je Träger,
// `boxPairing.ts`). Wann das geht, entscheidet `removeBox`.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ boxId: string }> },
) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!boxCouplingEnabled()) return errorResponse(404, "NOT_FOUND");
  const { boxId } = await params;
  return serviceResponse(await removeBox(session.user.id, boxId));
}
