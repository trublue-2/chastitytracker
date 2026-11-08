import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Das gemeinsame Versand-Ende: wer wartet worauf, was passiert bei Fehler und Hänger.
 * Was an die Kanäle GEHT, hält `deliveryContract.test.ts` für alle Versandstellen fest — hier die
 * Warte-Regel des Helfers selbst.
 */
vi.mock("@/lib/shared/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/messages/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messages/mail")>()),
  sendMailSafe: vi.fn(),
}));
vi.mock("@/lib/messages/push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/messages/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("@/lib/shared/serverLog", () => ({ structuredLog: vi.fn() }));
vi.mock("@/lib/messages/deliveryChannels", () => ({
  deliveryChannels: vi.fn(async () => ({ mail: true, push: true, telegram: true })),
}));
vi.mock("@/lib/messages/messageService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./messageService")>()),
  recordInboxDelivery: vi.fn(async () => ({ badge: 1, channels: { mail: true, push: true, telegram: true } })),
}));

import { deliverToChannels, notifyUser, CHANNEL_DEADLINE_MS } from "./notify";
import { sendMailSafe } from "@/lib/messages/mail";
import { sendPushToUser } from "@/lib/messages/push";
import { sendTelegram } from "@/lib/messages/telegram";
import { structuredLog } from "@/lib/shared/serverLog";
import { prisma } from "@/lib/shared/prisma";
import { APP_NAME } from "@/lib/shared/constants";

type Spy = ReturnType<typeof vi.fn>;
const mail = sendMailSafe as unknown as Spy;
const push = sendPushToUser as unknown as Spy;
const telegram = sendTelegram as unknown as Spy;
const log = structuredLog as unknown as Spy;

const RECIPIENT = { id: "u1", email: "sub@example.org", telegramChatId: "chat-1" };
const ALL = { mail: true, push: true, telegram: true };
const CONTENT = { mail: () => ({ subject: "Betreff", html: "<p>x</p>" }), title: "Titel", body: "Text", url: "/x", badge: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  mail.mockResolvedValue(undefined);
  push.mockResolvedValue(undefined);
  telegram.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("deliverToChannels", () => {
  it("setzt den Anwendungsnamen vor den Betreff und gibt Titel und Text an Push und Telegram", async () => {
    await deliverToChannels(RECIPIENT, ALL, CONTENT);
    expect(mail).toHaveBeenCalledWith("sub@example.org", `${APP_NAME} – Betreff`, "<p>x</p>");
    expect(push).toHaveBeenCalledWith("u1", "Titel", "Text", "/x", 2);
    expect(telegram).toHaveBeenCalledWith("chat-1", "Titel\n\nText");
  });

  it("baut die Mail nur, wenn sie hinausgeht", async () => {
    const build = vi.fn(() => ({ subject: "s", html: "h" }));
    await deliverToChannels(RECIPIENT, { ...ALL, mail: false }, { ...CONTENT, mail: build });
    await deliverToChannels({ ...RECIPIENT, email: null }, ALL, { ...CONTENT, mail: build });
    expect(build).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("ohne Mail-Inhalt geht keine Mail hinaus, Push und Telegram schon", async () => {
    await deliverToChannels(RECIPIENT, ALL, { title: "t", body: "b" });
    expect(mail).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledOnce();
    expect(telegram).toHaveBeenCalledOnce();
  });

  it("wirft nie: eine gescheiterte Push lässt die übrigen Kanäle durch und steht im Log", async () => {
    push.mockRejectedValue(new Error("db down"));
    await expect(deliverToChannels(RECIPIENT, ALL, CONTENT)).resolves.toBeUndefined();
    expect(mail).toHaveBeenCalledOnce();
    expect(telegram).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("notify", "channel_failed", expect.objectContaining({ channel: "push", error: "db down" }));
  });

  it("die Kanäle laufen parallel: ein langsamer hält die anderen nicht auf", async () => {
    let releaseMail!: () => void;
    mail.mockReturnValue(new Promise<void>((r) => { releaseMail = r; }));
    const done = deliverToChannels(RECIPIENT, ALL, CONTENT);
    await Promise.resolve();
    await Promise.resolve();
    expect(push).toHaveBeenCalledOnce();
    expect(telegram).toHaveBeenCalledOnce();
    releaseMail();
    await done;
  });

  it("ein hängender Kanal hält den Aufrufer höchstens bis zur Obergrenze fest", async () => {
    vi.useFakeTimers();
    mail.mockReturnValue(new Promise(() => {})); // antwortet nie
    let finished = false;
    const done = deliverToChannels(RECIPIENT, ALL, CONTENT).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(CHANNEL_DEADLINE_MS - 1);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(finished).toBe(true);
    expect(log).toHaveBeenCalledWith("notify", "channel_deadline", expect.objectContaining({ channel: "mail" }));
  });
});

describe("notifyUser — Überschrift der Mail", () => {
  it("escaped den Betreff, der den Benutzernamen trägt (HTML im Namen)", async () => {
    (prisma.user.findUnique as unknown as Spy).mockResolvedValue({
      id: "u1", username: "sub", email: "sub@example.org", locale: "de", telegramChatId: null,
      notifyMail: "all", notifyPush: "all", notifyTelegram: "all",
    });
    await notifyUser("u1", {
      subjectKey: "penaltyReportedDoneSubject",
      messageKey: "taskReviewMessageKeyholder",
      params: { username: '<img src=x onerror="alert(1)">', title: "T" },
      inbox: false,
    });
    const html = mail.mock.calls[0][2] as string;
    const heading = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)![1];
    expect(heading).toContain("&lt;img");
    expect(heading).not.toContain("<img");
  });
});
