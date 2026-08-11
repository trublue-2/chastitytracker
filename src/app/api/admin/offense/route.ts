import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor, requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";
import { validateManualOffenseInput, createManualOffense, withdrawManualOffense } from "@/lib/manualOffenseService";

/** Von Hand notierte Vergehen anlegen und zurückziehen — der Browser-Rand desselben
 *  `manualOffenseService`, durch den auch der MCP schreibt (`record_offense`, `withdraw`).
 *
 *  BEURTEILT wird hier nichts: das läuft über `/api/admin/strafe` wie bei jeder abgeleiteten
 *  Vergehensart, weil `collectDetectedOffenses` die Art `manual_offense` bereits kennt. */

export async function POST(req: Request) {
  try {
    const { userId, occurredAt, title, description } = await req.json();
    if (typeof userId !== "string" || !userId) return errorResponse(400, "USER_ID_REQUIRED");

    const actor = await requireKeyholderOrAdminActor(userId);
    if (actor instanceof NextResponse) return actor;

    const input = validateManualOffenseInput({
      userId, occurredAt, title, description,
      // Audit-Feld wie `StrafeRecord.judgedBy` — der MCP schreibt hier "ai", der Browser den Namen.
      createdBy: actor.user.name ?? "?",
    });
    if (!input.ok) return serviceFailure(input);

    // Ein globaler Admin kommt an JEDE userId — ohne diese Prüfung liefe eine unbekannte id in einen
    // Fremdschlüssel-Fehler und damit in einen 500. Bei einem Keyholder ist sie schon durch.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return errorResponse(404, "USER_NOT_FOUND");

    const created = await createManualOffense(input.data);
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/offense]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

/** Zurückziehen setzt `withdrawnAt`, löscht nicht — das Vergehen fällt aus dem Strafbuch, bleibt
 *  aber nachlesbar. Ein bereits gefälltes Urteil überlebt den Rückzug (siehe `ManualOffense` im
 *  Schema); zurückgenommen wird es über „Rückgängig" am Urteil selbst. */
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (typeof id !== "string" || !id) return errorResponse(400, "OFFENSE_NOT_FOUND");

    // IDOR: erst die Zeile lesen, dann gegen IHREN Sub prüfen — gleiche Reihenfolge wie
    // `DELETE /api/admin/strafe`. Der Service filtert zusätzlich auf `userId`.
    const offense = await prisma.manualOffense.findUnique({ where: { id }, select: { userId: true } });
    if (!offense) return errorResponse(404, "OFFENSE_NOT_FOUND");

    const err = await requireKeyholderOrAdminApi(offense.userId);
    if (err) return err;

    const result = await withdrawManualOffense(id, offense.userId);
    // Beurteilt ist kein „schon zurückgezogen": der Weg zurück ist die Rücknahme des Urteils.
    if (result === "judged") return errorResponse(409, "OFFENSE_ALREADY_JUDGED");
    if (result === "not_found") return errorResponse(409, "OFFENSE_ALREADY_WITHDRAWN");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/offense]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
