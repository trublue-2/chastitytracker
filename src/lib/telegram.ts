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

/**
 * Telegram-Kurzmeldung an einen Nutzer über seine User-id — lädt die verknüpfte `telegramChatId` und
 * sendet fire-and-forget, exakt wie {@link import("@/lib/push").firePush}. Nimmt `title` und `body`
 * getrennt (dieselbe Signatur wie `firePush`) und fügt sie als `Titel\n\nText` zusammen; ohne
 * verknüpften Chat passiert nichts. Für die reichhaltigen Direktiv-Meldungen (Verschluss/Orgasmus/
 * Kontrolle), die bewusst ungefiltert neben Mail+Push gehen und `firePush` direkt rufen, statt über
 * `notifyUser` — dort ist Telegram schon eingebaut.
 */
export function fireTelegram(userId: string, title: string, body: string): void {
  void (async () => {
    try {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
      if (u?.telegramChatId) await sendTelegram(u.telegramChatId, `${title}\n\n${body}`);
    } catch (e) {
      structuredLog("telegram", "fire_error", { userId, error: (e as Error).message });
    }
  })();
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
 * Ergebnis von {@link consumeTelegramLink} — drei Ausgänge statt „Nutzer oder null", damit der
 * Webhook eine WIEDERHOLUNG derselben Zustellung nicht als Fehler meldet:
 * - `linked`  → frisch verknüpft, Bestätigung senden
 * - `already` → dieser Chat ist bereits verknüpft ODER ein paralleler Anspruch gewinnt gerade
 *               (Telegram stellt dieselbe Nachricht bei zu langsamem 200 erneut zu) → still bestätigen
 * - `invalid` → Token wirklich unbekannt/abgelaufen und kein verknüpfter Chat → Hinweis senden
 */
export type TelegramLinkResult =
  | { status: "linked"; userId: string; locale: string }
  | { status: "already" }
  | { status: "invalid" };

/**
 * Einen `/start <token>`-Klartext einlösen: den zugehörigen Nutzer finden, seine `telegramChatId`
 * setzen und den Token löschen (single-use).
 *
 * Race-sicher UND idempotent, weil Telegram-Webhooks bei einem langsamen HTTP-200 dieselbe Nachricht
 * mehrfach (auch parallel) zustellen: Nur der Aufruf, der die Token-Zeile TATSÄCHLICH löscht
 * (`deleteMany … count === 1`), gewinnt und verknüpft; jede Wiederholung landet auf `already` und
 * schickt kein zweites „verbunden". Weil die Verknüpfung VOR dem Bestätigungs-Versand committet, ist
 * bei einer späteren Wiederholung der Chat entweder schon verknüpft (→ `already`) oder der Token
 * steht noch (→ Anspruch) — ein fälschliches „ungültig" kann es dadurch nicht geben.
 */
export async function consumeTelegramLink(token: string, chatId: string): Promise<TelegramLinkResult> {
  const chatLinked = async (): Promise<boolean> =>
    !!(await prisma.user.findFirst({ where: { telegramChatId: chatId }, select: { id: true } }));

  const row = await prisma.telegramLinkToken.findUnique({
    where: { token: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  });
  // Kein/abgelaufener Token: Wiederholung einer bereits geglückten Verknüpfung still bestätigen,
  // ein echter Alt-/Fremd-Token bleibt „ungültig".
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await prisma.telegramLinkToken.delete({ where: { id: row.id } }).catch(() => {});
    return (await chatLinked()) ? { status: "already" } : { status: "invalid" };
  }
  // Atomarer Anspruch: verliert dieser Aufruf das Rennen (count === 0), verknüpft ein paralleler
  // Aufruf gerade — nicht doppelt melden.
  const claim = await prisma.telegramLinkToken.deleteMany({ where: { id: row.id } });
  if (claim.count === 0) return { status: "already" };

  // Gewonnen: chatId gehört zu genau EINEM Nutzer (`@unique`), also bestehende Fremd-Bindung ERST
  // lösen, dann setzen; übrige Tokens desselben Nutzers verwerfen (single-use).
  const [, user] = await prisma.$transaction([
    prisma.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: row.userId } }, data: { telegramChatId: null } }),
    prisma.user.update({ where: { id: row.userId }, data: { telegramChatId: chatId }, select: { id: true, locale: true } }),
    prisma.telegramLinkToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { status: "linked", userId: user.id, locale: user.locale };
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
