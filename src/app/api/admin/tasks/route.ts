import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { createTask, type CreateTaskParams } from "@/lib/taskService";
import { punishWithTask, type StoredOffenseType } from "@/lib/strafurteilService";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/** Keyholder stellt dem Sub eine Aufgabe. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    const holdUntil = new Date(body.holdUntil);
    if (Number.isNaN(holdUntil.getTime())) return errorResponse(400, "INVALID_DATETIME");

    // Felder EINZELN übernehmen, nie den rohen Body spreaden: was der Service an Parametern kennt,
    // wäre sonst von aussen setzbar. (Der Handelnde ist ohnehin ausser Reichweite — er ist ein
    // eigenes Argument, kein Feld dieses Objekts.)
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
    // Urteil zusammen, sonst stünden sie unverbunden nebeneinander. Der Urteilende ist derselbe
    // Handelnde wie beim blossen Stellen — der MCP-Agent urteilt über `judge_offense`, nicht hier.
    //
    // `offenseType` und `allowRevision: false` machen diesen Weg zum ZWEITEN Browser-Eingang
    // desselben Urteils und binden ihn an dieselben zwei Regeln wie `POST /api/admin/strafe`: über
    // welche ART an einer geteilten ref geurteilt wird, sagt der geklickte Abschnitt — und ein
    // bestehendes Urteil wird nicht ersetzt. Ohne die zweite Angabe liesse sich eine Verwerfung aus
    // einem anderen Tab still durch PUNISHED überschreiben — und zwei kurz aufeinanderfolgende
    // Urteile meldeten dem Träger BEIDE Ausgänge, während in der Datenbank nur einer steht.
    // (Die überholte Verwerfungs-Meldung selbst bleibt nicht stehen: `dismissalMessageStillApplies`
    // blendet sie aus, sobald das Urteil nicht mehr DISMISSED ist.)
    const offenseRef = body[TASK_FORM_QUERY.offenseRef];
    const offenseType = body[TASK_FORM_QUERY.offenseType];
    const result = typeof offenseRef === "string" && offenseRef
      ? await punishWithTask({
          ...params,
          refId: offenseRef,
          offenseType: typeof offenseType === "string" && offenseType ? offenseType as StoredOffenseType : undefined,
          allowRevision: false,
        }, sessionActor(actor))
      : await createTask(params, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[POST /api/admin/tasks]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
