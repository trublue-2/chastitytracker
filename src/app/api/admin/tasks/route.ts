import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { createTask, type CreateTaskParams } from "@/lib/taskService";
import { punishWithTask } from "@/lib/strafurteilService";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Keyholder stellt dem Sub eine Aufgabe. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const err = await requireKeyholderOrAdminApi(body.userId);
    if (err) return err;

    const holdUntil = new Date(body.holdUntil);
    if (Number.isNaN(holdUntil.getTime())) return errorResponse(400, "INVALID_DATETIME");

    // Felder EINZELN übernehmen, nie den rohen Body spreaden: was der Service an Parametern kennt,
    // wäre sonst von aussen setzbar. Ein `suppressNotice: true` im Request legte dem Sub eine
    // Aufgabe an, von der er nie erfährt — und ihr Versäumen wird ihm später als Vergehen
    // vorgehalten.
    const params: CreateTaskParams = {
      userId: body.userId,
      title: body.title,
      description: body.description,
      holdUntil,
      startGraceMin: body.startGraceMin,
      isPunishment: body.isPunishment,
      penaltyReason: body.penaltyReason,
      requirements: body.requirements,
      proofs: body.proofs,
    };

    // Mit `offenseRef` ist die Aufgabe die STRAFE für ein Vergehen: dann entstehen Aufgabe und
    // Urteil zusammen, sonst stünden sie unverbunden nebeneinander. `judgedBy: "admin"` — der
    // MCP-Agent urteilt über `judge_offense`, nicht über diese Route.
    const offenseRef = body[TASK_FORM_QUERY.offenseRef];
    const result = typeof offenseRef === "string" && offenseRef
      ? await punishWithTask({ ...params, refId: offenseRef, judgedBy: "admin" })
      : await createTask(params);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/tasks]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
