import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { withdrawTask, deleteTask } from "@/lib/taskService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/**
 * Wer diese Aufgabe anfassen darf — der BESITZER bestimmt es, nicht der Body.
 *
 * Beide Verben brauchen dieselben drei Schritte (Zeile lesen, 404, Handelnden prüfen); zweimal
 * hingeschrieben liefe der eine dem anderen davon, sobald ein vierter Schritt dazukäme.
 */
async function resolveTaskActor(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, select: { userId: true } });
  if (!task) return errorResponse(404, "TASK_NOT_FOUND");
  const actor = await requireKeyholderOrAdminActor(task.userId);
  if (actor instanceof NextResponse) return actor;
  return { userId: task.userId, actor };
}

/** Aufgabe zurückziehen. Geändert wird über das MCP-Tool `edit_task` — ein zweiter, vom Web-UI
 *  nicht benutzter Änderungspfad wäre ungetesteter Schreibzugriff auf einer Admin-Route. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const resolved = await resolveTaskActor(id);
    if (resolved instanceof NextResponse) return resolved;

    const body = await req.json();

    if (body.action === "withdraw") {
      const result = await withdrawTask(id, resolved.userId, sessionActor(resolved.actor));
      if (!result.ok) return serviceFailure(result);
      return NextResponse.json({ ok: true });
    }

    return errorResponse(400, "UNKNOWN_ACTION");
  } catch (err) {
    console.error("[PATCH /api/admin/tasks/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

/**
 * Aufgabe endgültig löschen — nur eine zurückgezogene, die Regel steht am Dienst.
 *
 * Eigener Verb statt einer weiteren `action` am PATCH: die Hausform ist `PATCH` auf der `[id]`-Route
 * für Änderungen und `DELETE` fürs Entfernen (`api/entries/[id]`, `api/admin/vorgaben/[id]`). Ein
 * Löschen als Unterfall einer Änderung zu verstecken hiesse, es aus Versehen erreichbar zu machen.
 *
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const resolved = await resolveTaskActor(id);
    if (resolved instanceof NextResponse) return resolved;

    const result = await deleteTask(id, resolved.userId);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/tasks/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
