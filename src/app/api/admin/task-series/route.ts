import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { createTaskSeries, listTaskSeries } from "@/lib/taskService";
import { taskSeriesParamsFromBody } from "@/lib/taskSeriesRequestBody";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Aktive Serien eines Subs — für die Keyholder-Liste (samt Termin-Vorschau). */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return errorResponse(400, "USER_ID_REQUIRED");
  const actor = await requireKeyholderOrAdminActor(userId);
  if (actor instanceof NextResponse) return actor;

  const rows = await listTaskSeries(userId);
  return NextResponse.json({
    series: rows.map(({ series: s, upcoming }) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      holdDurationMin: s.holdDurationMin,
      holdWindowMin: s.holdWindowMin,
      startGraceMin: s.startGraceMin,
      freq: s.freq,
      interval: s.interval,
      weekdayMask: s.weekdayMask,
      ordinal: s.ordinal,
      timeOfDay: s.timeOfDay,
      startsOn: s.startsOn.toISOString(),
      until: s.until?.toISOString() ?? null,
      requirementCount: s.requirements.length,
      proofCount: s.proofs.length,
      upcoming: upcoming.map((d) => d.toISOString()),
    })),
  });
}

/** Keyholder stellt eine wiederkehrende Aufgabe. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    const result = await createTaskSeries(taskSeriesParamsFromBody(body.userId, body), sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/task-series]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
