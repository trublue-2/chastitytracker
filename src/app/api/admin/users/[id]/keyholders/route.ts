import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";

/** Admin-only management of a sub's keyholders (AdminUserRelationship: adminId = keyholder, userId = sub).
 *  Self-control is rejected (a user can never be their own keyholder). */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await requireAdminApi();
  if (err) return err;

  const { id: subId } = await params;
  const { keyholderId } = await req.json();

  if (!keyholderId || typeof keyholderId !== "string") {
    return NextResponse.json({ error: "keyholderId fehlt" }, { status: 400 });
  }
  if (keyholderId === subId) {
    return NextResponse.json({ error: "Ein User kann nicht sein eigener Keyholder sein" }, { status: 400 });
  }
  const keyholder = await prisma.user.findUnique({ where: { id: keyholderId }, select: { id: true, role: true } });
  if (!keyholder) return NextResponse.json({ error: "Keyholder-User nicht gefunden" }, { status: 404 });
  // Admins already have full access; assigning one as a keyholder would widen their admin scope
  // (the AdminUserRelationship table is shared with USE_ADMIN_RELATIONSHIPS scoping).
  if (keyholder.role === "admin") {
    return NextResponse.json({ error: "Admins können nicht als Keyholder zugewiesen werden" }, { status: 400 });
  }

  await prisma.adminUserRelationship.upsert({
    where: { adminId_userId: { adminId: keyholderId, userId: subId } },
    update: {},
    create: { adminId: keyholderId, userId: subId },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await requireAdminApi();
  if (err) return err;

  const { id: subId } = await params;
  const { keyholderId } = await req.json();
  if (!keyholderId || typeof keyholderId !== "string") {
    return NextResponse.json({ error: "keyholderId fehlt" }, { status: 400 });
  }

  await prisma.adminUserRelationship.deleteMany({ where: { adminId: keyholderId, userId: subId } });
  return NextResponse.json({ ok: true });
}
