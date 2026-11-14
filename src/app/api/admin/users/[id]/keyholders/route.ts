import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";

/** Admin-only management of a sub's keyholders (AdminUserRelationship: adminId = keyholder, userId = sub).
 *  Self-control is rejected (a user can never be their own keyholder). An admin may be assigned too:
 *  admins control every sub by role, but only an assignment lets them read what the sub shares
 *  (journal, `canReadJournal`) — so a sole admin-keyholder needs the row. Not with
 *  USE_ADMIN_RELATIONSHIPS: there the row is what scopes an admin's visible subs. */

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
  // Mit USE_ADMIN_RELATIONSHIPS bestimmt genau diese Tabelle, welche Subs ein Admin sieht. Dort würde
  // die Zuordnung eines Admins seinen Sichtbereich erweitern (und die Route prüft keinen Bereich des
  // Handelnden) — also bleibt es dabei abgelehnt. Ohne das Flag sehen Admins ohnehin alle Subs.
  if (keyholder.role === "admin" && process.env.USE_ADMIN_RELATIONSHIPS === "true") {
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
