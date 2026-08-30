import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function POST(req: NextRequest) {
  try {
    const { userId, art, message, beginntAt, endsAt, vorgegebeneArt, oeffnenErlaubt, delayMinutes, wirksamAbAt } = await req.json();

    const actor = await requireKeyholderOrAdminActor(userId);
    if (actor instanceof NextResponse) return actor;

    const result = await createOrgasmusAnforderung(
      { userId, art, message, beginntAt, endsAt, vorgegebeneArt, oeffnenErlaubt, delayMinutes, wirksamAbAt },
      sessionActor(actor),
    );
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/orgasmus-anforderung]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
