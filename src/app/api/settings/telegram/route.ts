import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/authGuards";
import { errorResponse } from "@/lib/serviceResult";
import { createTelegramLink, unlinkTelegram, telegramLinkAvailable } from "@/lib/telegram";

/** GET /api/settings/telegram — Verknüpfungs-Status des eigenen Kontos (für die Anzeige, nachdem der
 *  Nutzer im Chat Start gedrückt hat und der Webhook die Bindung gesetzt hat). Ob die Instanz einen
 *  Bot führt, entscheidet schon serverseitig, ob der Abschnitt überhaupt erscheint (`telegramConfigured`
 *  in `getSettingsProps`) — hier zählt nur noch, ob DIESER Nutzer verknüpft ist. */
export async function GET() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { telegramChatId: true } });
  return NextResponse.json({ linked: !!user?.telegramChatId });
}

/**
 * POST /api/settings/telegram — Selbstbedienung des Nutzers: einen frischen Verknüpfungs-Link
 * erzeugen. Kein Keyholder-Feld, deshalb Session-Scope statt Admin-Guard (und kein MCP-Weg — die
 * KI verknüpft keinen eigenen Chat). Antwort: `{ url }` mit dem Deep-Link `t.me/<bot>?start=<token>`.
 * Ohne konfigurierten Bot (Token + Name) gibt es nichts zu verbinden → stabiler Fehler-Code.
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!telegramLinkAvailable()) return errorResponse(400, "TELEGRAM_NOT_CONFIGURED");

  const url = await createTelegramLink(session.user.id);
  if (!url) return errorResponse(400, "TELEGRAM_NOT_CONFIGURED");
  return NextResponse.json({ url });
}

/** DELETE /api/settings/telegram — Verknüpfung des eigenen Kontos wieder lösen. */
export async function DELETE() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  await unlinkTelegram(session.user.id);
  return NextResponse.json({ ok: true });
}
