import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { withdrawTask } from "@/lib/taskService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Aufgabe zurückziehen. Geändert wird über das MCP-Tool `edit_task` — ein zweiter, vom Web-UI
 *  nicht benutzter Änderungspfad wäre ungetesteter Schreibzugriff auf einer Admin-Route. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Der Besitzer der Aufgabe bestimmt, wer sie ändern darf — nicht der Body.
    const task = await prisma.task.findUnique({ where: { id }, select: { userId: true } });
    if (!task) return errorResponse(404, "TASK_NOT_FOUND");

    const err = await requireKeyholderOrAdminApi(task.userId);
    if (err) return err;

    const body = await req.json();

    if (body.action === "withdraw") {
      const result = await withdrawTask(id, task.userId);
      if (!result.ok) return serviceFailure(result);
      return NextResponse.json({ ok: true });
    }

    return errorResponse(400, "UNKNOWN_ACTION");
  } catch (err) {
    console.error("[PATCH /api/admin/tasks/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
