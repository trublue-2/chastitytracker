import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { withdrawOrgasmusAnforderungById } from "@/lib/orgasmusAnforderungService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const oa = await prisma.orgasmusAnforderung.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!oa) return errorResponse(404, "NOT_FOUND");

  const actor = await requireKeyholderOrAdminActor(oa.userId);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json();

  if (body.action === "withdraw") {
    const result = await withdrawOrgasmusAnforderungById(id, oa.userId, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  }

  return errorResponse(400, "UNKNOWN_ACTION");
}
