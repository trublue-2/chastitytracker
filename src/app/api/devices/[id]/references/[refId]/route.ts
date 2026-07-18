import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { manageableDeviceOwner } from "@/lib/deviceAccess";
import { deleteReference } from "@/lib/deviceReferenceService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

type Params = { params: Promise<{ id: string; refId: string }> };

/** DELETE /api/devices/[id]/references/[refId] — einzelne Referenz entfernen. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id, refId } = await params;
  // Zugriff über das Gerät prüfen (Owner/Admin/Keyholder) und die Löschung auf dessen Owner scopen.
  const ownerId = await manageableDeviceOwner(id, session.user.id, session.user.role);
  if (!ownerId) return errorResponse(404, "NOT_FOUND");
  const result = await deleteReference(refId, ownerId);
  if (!result.ok) return serviceFailure(result);
  return new NextResponse(null, { status: 204 });
}
