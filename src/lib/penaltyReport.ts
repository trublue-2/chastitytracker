import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/**
 * Der Träger meldet eine verhängte Strafe als erledigt — sein Rückkanal zur Keyholderin.
 *
 * Schliesst NICHTS: `erledigtAt` setzt weiterhin nur sie (`judgeOffense` mit `complete`). Die Meldung
 * stempelt `reportedDoneAt`, und die Route sagt ihr Bescheid. Ohne sie stand eine Freitext-Strafe beim
 * Träger als offen, bis die Keyholderin zufällig ins Strafbuch schaute — und die sah sie nach ihrem
 * Urteil auf keiner Übersicht mehr (Rückmeldung 11.09.2026).
 *
 * Einmal je Urteil: eine zweite Meldung ändert nichts und meldet nichts (`reported: false`) — ein
 * Doppeltipp soll ihren Posteingang nicht zweimal erreichen. Ein neues Urteil und „Wieder offen"
 * leeren den Stempel (`writeJudgment`, `judgeOffense`).
 */
export async function reportPenaltyDone(
  userId: string,
  refId: string,
  now: Date = new Date(),
): Promise<ServiceResult<{ reported: boolean; penalty: string | null }>> {
  const rec = await prisma.strafeRecord.findUnique({
    where: { refId },
    select: { userId: true, status: true, erledigtAt: true, reportedDoneAt: true, reason: true },
  });
  // Fremd oder nicht vorhanden: dieselbe Antwort — sie soll nicht verraten, dass es das Urteil gibt.
  if (!rec || rec.userId !== userId) return serviceFail(404, "JUDGMENT_NOT_FOUND");
  if (rec.status !== "PUNISHED") return serviceFail(400, "PENALTY_NOT_PUNISHED");
  if (rec.erledigtAt || rec.reportedDoneAt) return { ok: true, data: { reported: false, penalty: rec.reason } };

  // Den offenen Zustand in der Bedingung: schliesst die Keyholderin die Strafe im selben Moment,
  // bleibt ihr Abschluss stehen und die Meldung entfällt.
  const res = await prisma.strafeRecord.updateMany({
    where: { refId, userId, status: "PUNISHED", erledigtAt: null, reportedDoneAt: null },
    data: { reportedDoneAt: now },
  });
  return { ok: true, data: { reported: res.count > 0, penalty: rec.reason } };
}
