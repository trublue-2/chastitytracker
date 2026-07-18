import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { manageableDeviceOwner } from "@/lib/deviceAccess";
import { isValidImageUrl } from "@/lib/constants";
import { listDeviceReferences, addReferenceFromUpload, importEntryAsReference } from "@/lib/deviceReferenceService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

type Params = { params: Promise<{ id: string }> };

/** GET /api/devices/[id]/references — kuratierte Referenzfotos des Geräts. */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const ownerId = await manageableDeviceOwner(id, session.user.id, session.user.role);
  if (!ownerId) return errorResponse(404, "NOT_FOUND");

  return NextResponse.json({ references: await listDeviceReferences(id) });
}

/**
 * POST /api/devices/[id]/references
 * Body: { imageUrl } (frisch hochgeladen) ODER { entryId } (aus bestehendem Foto übernehmen).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const ownerId = await manageableDeviceOwner(id, session.user.id, session.user.role);
  if (!ownerId) return errorResponse(404, "NOT_FOUND");

  const body = await req.json();

  let result;
  if (typeof body.entryId === "string" && body.entryId) {
    result = await importEntryAsReference(id, body.entryId, ownerId);
  } else if (typeof body.imageUrl === "string" && isValidImageUrl(body.imageUrl)) {
    result = await addReferenceFromUpload(id, body.imageUrl, body.note);
  } else {
    return errorResponse(400, "REFERENCE_SOURCE_REQUIRED");
  }

  if (!result.ok) return serviceFailure(result);
  return NextResponse.json(result.data, { status: 201 });
}
