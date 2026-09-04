import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/oauth";
import { structuredLog } from "@/lib/serverLog";

// ── Instanz-Konfiguration ────────────────────────────────────────────────────
// EIN Bot je Instanz: ein Token, ein Webhook auf die eigene Subdomain. Der Betreiber legt den Bot
// bei BotFather an und hinterlegt Token, Bot-Name und das Webhook-Secret (siehe CLAUDE.md-ENV-Liste).
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME; // ohne führendes @, z.B. "MyTrackerBot"
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/** Ist der Verknüpfungs-Weg nutzbar — Bot-Token UND Bot-Name (aus dem der Deep-Link gebaut wird)?
 *  Der Versand selbst braucht nur das Token und prüft es in `sendTelegram` inline; ohne Token wird
 *  der Kanal still übersprungen, genau wie Mail ohne SMTP. */
export function telegramLinkAvailable(): boolean {
  return !!BOT_TOKEN && !!BOT_USERNAME;
}

/**
 * Eine Meldung an einen verknüpften Chat senden — fehlertolerant und exakt nach dem Muster von
 * {@link import("@/lib/mail").sendMailSafe}: ohne konfiguriertes `TELEGRAM_BOT_TOKEN` still
 * übersprungen (kein Wurf), und jeder Fehler (Netz, ungültiger Chat, gesperrter Bot) wird gefangen
 * und geloggt statt den awaitenden Business-Flow mit einem 500 abzubrechen.
 */
export async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    structuredLog("telegram", "skipped_no_token", { chatId });
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      // `notifyLoadedUser` awaitet den Versand — ohne Timeout hinge eine lahme Telegram-API die
      // Antwort des auslösenden Requests fest (Push ist daneben fire-and-forget). 10s wie bei APNs.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Der Grund steht im Body (z.B. "chat not found", "bot was blocked by the user").
      const detail = await res.text().catch(() => "");
      structuredLog("telegram", "send_failed", { chatId, status: res.status, detail: detail.slice(0, 200) });
      return;
    }
    structuredLog("telegram", "sent", { chatId });
  } catch (e) {
    structuredLog("telegram", "send_error", { chatId, error: (e as Error).message });
  }
}

// ── Verknüpfung: kurzlebiger, einmaliger Token (Muster wie PasswordResetToken) ────────────────────

const LINK_TTL_MS = 15 * 60 * 1000; // 15 Minuten — der Nutzer drückt gleich nach dem Antippen Start.

/** Frischen Verknüpfungs-Token für den Nutzer anlegen und den Deep-Link `t.me/<bot>?start=<token>`
 *  zurückgeben. Alte Tokens desselben Nutzers werden verworfen — es gilt nur der jüngste Link.
 *  Gespeichert wird nur der HASH; der Klartext lebt allein im zurückgegebenen Link. */
export async function createTelegramLink(userId: string): Promise<string | null> {
  if (!BOT_USERNAME) return null;
  const token = generateToken(); // URL-sicher; nur der Hash wird gespeichert
  await prisma.telegramLinkToken.deleteMany({ where: { userId } });
  await prisma.telegramLinkToken.create({
    data: { token: hashToken(token), userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) },
  });
  return `https://t.me/${BOT_USERNAME}?start=${token}`;
}

/**
 * Einen `/start <token>`-Klartext einlösen: den zugehörigen Nutzer finden, seine `telegramChatId`
 * setzen und den Token löschen (single-use). Liefert den Nutzer zurück (für die Bestätigung im
 * Chat) oder `null`, wenn der Token unbekannt oder abgelaufen ist.
 */
export async function consumeTelegramLink(token: string, chatId: string): Promise<{ userId: string; locale: string } | null> {
  const row = await prisma.telegramLinkToken.findUnique({
    where: { token: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!row) return null;
  // Abgelaufen: aufräumen und ablehnen.
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.telegramLinkToken.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  // Ein Vorgang, atomar und in dieser Reihenfolge: chatId gehört zu genau EINEM Nutzer (`@unique`),
  // also muss eine bestehende Fremd-Bindung ERST gelöst werden, sonst schlägt das Schreiben am
  // Unique-Index fehl; der abschliessende Token-Löschvorgang macht die Verknüpfung single-use.
  const [, user] = await prisma.$transaction([
    prisma.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: row.userId } }, data: { telegramChatId: null } }),
    prisma.user.update({ where: { id: row.userId }, data: { telegramChatId: chatId }, select: { id: true, locale: true } }),
    prisma.telegramLinkToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { userId: user.id, locale: user.locale };
}

/** Verknüpfung eines Nutzers lösen: Chat-Bindung entfernen und offene Link-Tokens verwerfen. */
export async function unlinkTelegram(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { telegramChatId: null } }),
    prisma.telegramLinkToken.deleteMany({ where: { userId } }),
  ]);
}

/** Prüft das von Telegram mitgeschickte Secret gegen `TELEGRAM_WEBHOOK_SECRET`. Ist kein Secret
 *  konfiguriert, wird der Webhook abgelehnt — ein ungeschützter Webhook liesse jeden fremde
 *  chat_ids setzen. Konstante-Zeit-Vergleich gegen Timing-Rückschlüsse. */
export function telegramWebhookSecretOk(headerValue: string | null): boolean {
  if (!WEBHOOK_SECRET || !headerValue) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(WEBHOOK_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
