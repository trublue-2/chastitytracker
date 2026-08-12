import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { requestKontrolle } from "@/lib/kontrolleService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    // Der Handelnde geht NEBEN dem Body hinein, nie darin: er kommt aus der Sitzung, und in einem
    // durchgereichten Body könnte der Aufrufer den Absender der Nachricht setzen, die sein Sub bekommt.
    const result = await requestKontrolle(body, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, deadline: result.data.deadline });
  } catch (err) {
    console.error("[POST /api/admin/kontrolle]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
