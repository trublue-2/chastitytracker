import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor } from "@/lib/authGuards";
import { previewSeriesOccurrences } from "@/lib/taskService";
import { taskSeriesParamsFromBody } from "@/lib/taskSeriesRequestBody";
import { errorResponse } from "@/lib/serviceResult";

/** Termin-Vorschau (Agenda) für eine noch nicht angelegte Serie — nur die Wiederhol-Regel zählt.
 *  Eine ungültige Regel ergibt eine leere Liste (die eigentliche Ablehnung nennt erst das Anlegen). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    const occ = await previewSeriesOccurrences(taskSeriesParamsFromBody(body.userId, body), { count: 5, maxDays: 400 });
    return NextResponse.json({ occurrences: occ.map((d) => d.toISOString()) });
  } catch (err) {
    console.error("[POST /api/admin/task-series/preview]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
