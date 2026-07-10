import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { updateSperrzeitEnde, verschlussWithdrawNotice } from "@/lib/verschlussAnforderungService";
import { notifyUser } from "@/lib/notify";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const va = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { userId: true, art: true },
  });
  if (!va) return errorResponse(404, "NOT_FOUND");

  const err = await requireKeyholderOrAdminApi(va.userId);
  if (err) return err;

  const body = await req.json();

  if (body.action === "withdraw") {
    await prisma.verschlussAnforderung.update({
      where: { id },
      data: { withdrawnAt: new Date() },
    });
    await notifyUser(va.userId, verschlussWithdrawNotice(va.art as "ANFORDERUNG" | "SPERRZEIT"));
    return NextResponse.json({ ok: true });
  }

  // setEnd: extend/shorten an active Sperrzeit. indefinite=true → open-ended; else endetAt (ISO).
  if (body.action === "setEnd") {
    const endetAt = body.indefinite ? null : new Date(body.endetAt);
    if (!body.indefinite && Number.isNaN(endetAt!.getTime())) {
      return errorResponse(400, "INVALID_DATETIME");
    }
    const result = await updateSperrzeitEnde(id, endetAt);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  }

  return errorResponse(400, "UNKNOWN_ACTION");
}
