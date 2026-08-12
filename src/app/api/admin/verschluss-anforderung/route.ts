import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { createVerschlussAnforderung } from "@/lib/verschlussAnforderungService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    // delayMinutes / wirksamAbAt (Terminierung) werden mit dem Rest des Body durchgereicht.
    // Der Handelnde geht NEBEN dem Body hinein, nie darin — siehe POST /api/admin/kontrolle.
    const result = await createVerschlussAnforderung(body, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id, scheduledFor: result.data.scheduledFor });
  } catch (err) {
    console.error("[POST /api/admin/verschluss-anforderung]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
