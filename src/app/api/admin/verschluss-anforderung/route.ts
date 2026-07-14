import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { createVerschlussAnforderung } from "@/lib/verschlussAnforderungService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const err = await requireKeyholderOrAdminApi(body.userId);
    if (err) return err;

    // delayMinutes / wirksamAbAt (Terminierung) werden mit dem Rest des Body durchgereicht.
    const result = await createVerschlussAnforderung(body);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id, scheduledFor: result.data.scheduledFor });
  } catch (err) {
    console.error("[POST /api/admin/verschluss-anforderung]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
