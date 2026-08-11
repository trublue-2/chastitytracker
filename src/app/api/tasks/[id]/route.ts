import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { completeTask } from "@/lib/taskService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Der Sub meldet seine eigene Aufgabe als erledigt. Mehrfach-Zustellung ist eingeplant (die Meldung
 *  läuft über die Offline-Warteschlange); ob eine Wiederholung den Zeitstempel vorrückt, entscheidet
 *  `completeTask` — bei einer Aufgabe ohne Bedingungen würde das eine rechtzeitige Meldung
 *  nachträglich zum Vergehen machen. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireApi();
    if (session instanceof NextResponse) return session;

    const body = await req.json().catch(() => ({}));
    if (body.action !== "complete") return errorResponse(400, "UNKNOWN_ACTION");

    const result = await completeTask(id, session.user.id!, body.note);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/tasks/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
