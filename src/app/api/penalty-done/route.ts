import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { reportPenaltyDone } from "@/lib/penaltyReport";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";
import { notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { getEventChannels } from "@/lib/notificationPrefs";
import { markLastAction } from "@/lib/appMeta";

/**
 * Der Träger meldet eine verhängte Strafe als erledigt (`reportPenaltyDone`).
 *
 * Er schreibt über SICH — `requireApi()` und die Session-id, kein `userId` im Body. Abschliessen kann
 * die Strafe weiterhin nur die Keyholderin; diese Route stempelt die Meldung und sagt ihr Bescheid.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const refId = typeof body?.refId === "string" ? body.refId.trim() : "";
  if (!refId) return errorResponse(400, "NOT_FOUND");

  const userId = session.user.id;
  const result = await reportPenaltyDone(userId, refId);
  if (!result.ok) return serviceFailure(result);

  markLastAction();

  // Nur die ERSTE Meldung geht hinaus — ein Doppeltipp ändert nichts und soll ihren Posteingang nicht
  // zweimal erreichen.
  if (result.data.reported) {
    const [controllers, channels] = await Promise.all([
      getControllersOfUser(userId),
      getEventChannels(userId, "PENALTY_REPORTED_DONE"),
    ]);
    await notifyControllers(userId, controllers, {
      subjectKey: "penaltyReportedDoneSubject",
      messageKey: "penaltyReportedDoneMessage",
      params: { username: session.user.name ?? "", penalty: result.data.penalty ?? "" },
      channels,
    });
  }

  return NextResponse.json({ ok: true });
}
