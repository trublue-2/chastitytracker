import { NextRequest, NextResponse } from "next/server";
import { consumeTelegramLink, forgetDeadChat, sendTelegram, telegramWebhookSecretOk } from "@/lib/telegram";
import { localeT } from "@/lib/emailI18n";
import { structuredLog } from "@/lib/serverLog";

/**
 * POST /api/telegram/webhook — Telegram ruft hier an, keine Session (in der Whitelist von
 * `proxy.ts`). Geschützt über das `secret_token`, das bei der Webhook-Registrierung gesetzt wird und
 * Telegram im Header `X-Telegram-Bot-Api-Secret-Token` mitschickt. Stimmt es nicht, wird abgelehnt.
 *
 * Aufgabe: das `/start <token>` einfangen, das der Nutzer nach dem Deep-Link auslöst, und die
 * `chat_id` an den zum Token gehörenden Nutzer schreiben. Und: eine Blockade des Bots sofort als
 * getrennte Verbindung übernehmen. Alles andere wird still bestätigt (200), damit Telegram nicht
 * endlos wiederholt.
 */
export async function POST(req: NextRequest) {
  if (!telegramWebhookSecretOk(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // kein JSON → nichts zu tun, aber nicht wiederholen
  }

  // Bot blockiert oder Chat gelöscht: Telegram meldet das als `my_chat_member` mit Status „kicked".
  // Sofort lösen — sonst merkt die App es erst beim nächsten Versand, und bei einer Frist ist das zu spät.
  const member = (update as { my_chat_member?: { chat?: { id?: number | string }; new_chat_member?: { status?: string } } })?.my_chat_member;
  if (member?.new_chat_member?.status === "kicked" && member.chat?.id != null) {
    try {
      await forgetDeadChat(String(member.chat.id));
    } catch (e) {
      structuredLog("telegram", "webhook_error", { error: (e as Error).message });
    }
    return NextResponse.json({ ok: true });
  }

  const msg = (update as { message?: { text?: string; chat?: { id?: number | string } } })?.message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  if (!text || chatId === undefined || chatId === null) return NextResponse.json({ ok: true });

  // Nur der Verknüpfungs-Befehl interessiert: "/start <token>".
  const match = /^\/start\s+(\S+)$/.exec(text);
  if (!match) return NextResponse.json({ ok: true });

  const chatIdStr = String(chatId);
  try {
    const result = await consumeTelegramLink(match[1], chatIdStr);
    if (result.status === "linked") {
      structuredLog("telegram", "linked", { userId: result.userId });
      await sendTelegram(chatIdStr, localeT(result.locale, "emails")("telegramLinkedConfirm"));
    } else if (result.status === "invalid") {
      // Unbekannter/abgelaufener Token — Empfänger-Sprache unbekannt, also Standardsprache.
      await sendTelegram(chatIdStr, localeT(null, "emails")("telegramLinkInvalid"));
    }
    // status === "already": Wiederholung oder paralleler Anspruch — still, damit ein einziges
    // /start nicht in mehreren Antworten endet (Telegram-Webhook-Retry bei langsamem 200).
  } catch (e) {
    structuredLog("telegram", "webhook_error", { error: (e as Error).message });
  }
  return NextResponse.json({ ok: true });
}
