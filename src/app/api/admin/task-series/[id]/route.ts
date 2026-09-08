import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { updateTaskSeries, withdrawTaskSeries } from "@/lib/taskService";
import { taskSeriesParamsFromBody } from "@/lib/taskSeriesRequestBody";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Serie ändern — Voll-Ersetzung der Vorlage (künftige Termine). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    const result = await updateTaskSeries(id, taskSeriesParamsFromBody(body.userId, body), sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[PUT /api/admin/task-series/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

/** Serie zurückziehen (Soft-Delete) — keine neuen Termine mehr. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return errorResponse(400, "USER_ID_REQUIRED");
    const actor = await requireKeyholderOrAdminActor(userId);
    if (actor instanceof NextResponse) return actor;

    const result = await withdrawTaskSeries(id, userId);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/task-series/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
