import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/passkey/list
 * List all passkeys for the authenticated user.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const passkeys = await prisma.passkey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      deviceName: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(passkeys);
}

/**
 * DELETE /api/auth/passkey/list
 * Delete a passkey by id.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Ensure the passkey belongs to the authenticated user
  const passkey = await prisma.passkey.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!passkey) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
  }

  await prisma.passkey.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
