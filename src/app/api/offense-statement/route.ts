import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { writeOffenseStatement } from "@/lib/offenseStatementService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";
import { notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { getEventChannels } from "@/lib/notificationPrefs";
import { offenseNameKey } from "@/lib/offenseLabels";
import { OFFENSE_REF_TYPE } from "@/lib/messageService";
import { markLastAction } from "@/lib/appMeta";
import type { OffenseCanonicalType } from "@/lib/offenseTypes";

/**
 * Die Stellungnahme des Trägers zu einem festgestellten Vergehen — schreiben, ändern, zurücknehmen.
 *
 * EIN Verb für alle drei: der Träger hat je Vergehen genau eine Stellungnahme, und ob sie neu
 * entsteht, sich ändert oder geleert wird, entscheidet der Inhalt. Drei Verben für ein Feld hätten
 * dem Aufrufer eine Zustandsfrage aufgebürdet, die er nicht besser beantworten kann als der Server.
 *
 * Der Träger schreibt über SICH — `requireApi()` und die Session-id, kein `userId` im Body. Der
 * Keyholder-Pfad fehlt bewusst: eine Stellungnahme, die jemand anders verfasst, wäre keine.
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const refId = typeof body?.refId === "string" ? body.refId.trim() : "";
  const offenseType = typeof body?.offenseType === "string" ? body.offenseType : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!refId || !offenseType) return errorResponse(400, "NOT_FOUND");

  const userId = session.user.id;
  const result = await writeOffenseStatement({ userId, refId, offenseType, text });
  if (!result.ok) return serviceFailure(result);

  markLastAction();

  // Gemeldet wird NUR die erste Abgabe. Eine Änderung läuft still — die Keyholderin sieht am
  // „geändert am" der Zeile, dass sich etwas bewegt hat, und eine Tippkorrektur soll ihren
  // Posteingang nicht ein zweites Mal erreichen.
  if (result.data.created) {
    const [controllers, channels] = await Promise.all([
      getControllersOfUser(userId),
      getEventChannels(userId, "OFFENSE_STATEMENT"),
    ]);
    await notifyControllers(userId, controllers, {
      subjectKey: "offenseStatementSubject",
      messageKey: "offenseStatementMessage",
      params: {
        username: session.user.name ?? "",
        // Die Art als i18n-SCHLÜSSEL, nicht als fertiger Text — dieselbe Regel wie bei der
        // Feststellung (`offenseAnnounce.ts`): gelesen wird die Zeile in der Sprache, die der
        // Empfänger beim ÖFFNEN eingestellt hat, nicht in der, die beim Schreiben galt.
        // `messagePresenter` löst `offenseKey` zu `{offense}` auf.
        offenseKey: offenseNameKey(offenseType as OffenseCanonicalType),
      },
      channels,
      // Dieselbe Referenz wie die Feststellung selbst: beide Zeilen reden über dasselbe Vergehen,
      // und im Posteingang stehen sie damit beieinander.
      inbox: { ref: { type: OFFENSE_REF_TYPE, id: refId } },
    });
  }

  return NextResponse.json({ ok: true, removed: result.data.removed });
}
