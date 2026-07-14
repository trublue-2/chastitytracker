import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { requestKontrolle } from "@/lib/kontrolleService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const err = await requireKeyholderOrAdminApi(body.userId);
    if (err) return err;

    const result = await requestKontrolle(body);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, deadline: result.data.deadline });
  } catch (err) {
    console.error("[POST /api/admin/kontrolle]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
