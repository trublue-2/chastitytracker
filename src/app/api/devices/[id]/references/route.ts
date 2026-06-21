import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl } from "@/lib/constants";
import { listDeviceReferences, addReferenceFromUpload, importEntryAsReference } from "@/lib/deviceReferenceService";

type Params = { params: Promise<{ id: string }> };

/** Returns the device id if the session user owns it (or is admin), else null. */
async function ownedDeviceUserId(id: string, sessionUserId: string, role: string): Promise<string | null> {
  const device = await prisma.device.findUnique({ where: { id }, select: { userId: true } });
  if (!device) return null;
  if (device.userId !== sessionUserId && role !== "admin") return null;
  return device.userId;
}

/** GET /api/devices/[id]/references — kuratierte Referenzfotos des Geräts. */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ownerId = await ownedDeviceUserId(id, session.user.id, session.user.role);
  if (!ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ references: await listDeviceReferences(id) });
}

/**
 * POST /api/devices/[id]/references
 * Body: { imageUrl } (frisch hochgeladen) ODER { entryId } (aus bestehendem Foto übernehmen).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ownerId = await ownedDeviceUserId(id, session.user.id, session.user.role);
  if (!ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  let result;
  if (typeof body.entryId === "string" && body.entryId) {
    result = await importEntryAsReference(id, body.entryId, ownerId);
  } else if (typeof body.imageUrl === "string" && isValidImageUrl(body.imageUrl)) {
    result = await addReferenceFromUpload(id, body.imageUrl, body.note);
  } else {
    return NextResponse.json({ error: "entryId oder gültige imageUrl erforderlich" }, { status: 400 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data, { status: 201 });
}
