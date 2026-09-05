import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/authGuards";
import { isRecipientNotificationEventType, NO_FIELDS_TO_UPDATE } from "@/lib/constants";
import { errorResponse } from "@/lib/serviceResult";

/**
 * PATCH /api/settings/notifications — der Nutzer schaltet seine EIGENEN Empfangs-Kanäle.
 *
 * Bewusst getrennt von `/api/admin/notifications`: dort setzt ein Keyholder die Ereignisse, über die
 * ER benachrichtigt wird. Hier gilt der Scope der Session, und nur die Empfänger-Liste ist
 * schreibbar — sonst wäre dies der Weg, über den ein Nutzer die Meldungen an seine Keyholder
 * abstellt.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  // `mail`/`push`/`telegram` einzeln optional: die drei Kanäle sind je Ereignis unabhängig schaltbar
  // (Mail/Push in den Einstellungen, Telegram nur sichtbar, wenn verknüpft) — jeder Schalter schreibt
  // NUR seinen Kanal, und der Upsert unten lässt die übrigen unberührt.
  const { eventType, mail, push, telegram } = await req.json();
  if (!isRecipientNotificationEventType(eventType)) return errorResponse(400, "UNKNOWN_ACTION");
  const data = {
    ...(typeof mail === "boolean" ? { mail } : {}),
    ...(typeof push === "boolean" ? { push } : {}),
    ...(typeof telegram === "boolean" ? { telegram } : {}),
  };
  // Gleicher Kontrakt wie setInspectionEscalationSettings & Geschwister: ein leerer Patch ist ein
  // Aufruferfehler mit eigenem Code, nicht "unbekannte Aktion".
  if (Object.keys(data).length === 0) return errorResponse(400, NO_FIELDS_TO_UPDATE);

  await prisma.notificationPreference.upsert({
    where: { userId_eventType: { userId: session.user.id, eventType } },
    create: { userId: session.user.id, eventType, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
