import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { requireAdminApi } from "@/lib/authGuards";
import { auth } from "@/lib/auth";

const USE_ADMIN_RELATIONSHIPS = process.env.USE_ADMIN_RELATIONSHIPS === "true";

/** Returns true if the admin is allowed to manage the given userId. */
async function adminCanManageUser(adminId: string, userId: string): Promise<boolean> {
  if (!USE_ADMIN_RELATIONSHIPS) return true;
  const rel = await prisma.adminUserRelationship.findUnique({
    where: { adminId_userId: { adminId, userId } },
    select: { adminId: true },
  });
  return rel !== null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;
  const { id } = await params;
  const existing = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  if (!session || !(await adminCanManageUser(session.user.id, existing.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, notiz } = await req.json();
  const vorgabe = await prisma.trainingVorgabe.update({
    where: { id },
    data: {
      gueltigAb: new Date(gueltigAb),
      gueltigBis: gueltigBis ? new Date(gueltigBis) : null,
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      notiz: notiz ?? null,
    },
  });
  await reorderVorgabenDates(vorgabe.userId);
  return NextResponse.json(vorgabe);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminApi();
  if (err) return err;

  const { id } = await params;
  const toDelete = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!toDelete) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  if (!session || !(await adminCanManageUser(session.user.id, toDelete.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await prisma.trainingVorgabe.delete({ where: { id }, select: { userId: true } });
  await reorderVorgabenDates(deleted.userId);
  return new NextResponse(null, { status: 204 });
}
