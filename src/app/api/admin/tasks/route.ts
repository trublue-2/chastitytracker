import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { createTask } from "@/lib/taskService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Keyholder stellt dem Sub eine Aufgabe. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const err = await requireKeyholderOrAdminApi(body.userId);
    if (err) return err;

    const holdUntil = new Date(body.holdUntil);
    if (Number.isNaN(holdUntil.getTime())) return errorResponse(400, "INVALID_DATETIME");

    const result = await createTask({ ...body, holdUntil });
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/tasks]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
