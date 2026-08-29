import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { releaseNow } from "@/lib/releaseNowService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/**
 * „Sofort aufschliessen" — Sperrzeit beenden, Box öffnen, Öffnung erfassen, in einem Griff.
 *
 * Die Route ist bewusst dünn: die ganze Ordnung der drei Schritte (und warum sie genau so lauten
 * muss, damit keine unerlaubte Öffnung im Strafbuch entsteht) steht im Dienst. Denselben Dienst
 * ruft das MCP-Werkzeug — eine zweite Abschrift hier liefe irgendwann auseinander.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const actor = await requireKeyholderOrAdminActor(body.userId);
    if (actor instanceof NextResponse) return actor;

    const result = await releaseNow({
      userId: body.userId,
      actor: sessionActor(actor),
      actorUserId: actor.user.id,
      allowOrgasm: body.allowOrgasm === true,
      note: typeof body.note === "string" ? body.note : null,
    });
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true, ...result.data });
  } catch (err) {
    console.error("[POST /api/admin/release-now]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
