import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/authGuards";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function POST(req: NextRequest) {
  try {
    const err = await requireAdminApi();
    if (err) return err;

    const { userId, art, nachricht, beginntAt, endetAt, vorgegebeneArt, oeffnenErlaubt } = await req.json();

    const result = await createOrgasmusAnforderung({
      userId, art, nachricht, beginntAt, endetAt, vorgegebeneArt, oeffnenErlaubt,
    });
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/orgasmus-anforderung]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
