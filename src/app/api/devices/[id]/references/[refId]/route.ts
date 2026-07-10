import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { deleteReference } from "@/lib/deviceReferenceService";
import { serviceFailure } from "@/lib/serviceResult";

type Params = { params: Promise<{ id: string; refId: string }> };

/** DELETE /api/devices/[id]/references/[refId] — einzelne Referenz entfernen. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { refId } = await params;
  // Admin → kein Owner-Filter; sonst auf eigene Geräte beschränkt.
  const ownerScope = session.user.role === "admin" ? null : session.user.id;
  const result = await deleteReference(refId, ownerScope);
  if (!result.ok) return serviceFailure(result);
  return new NextResponse(null, { status: 204 });
}
