import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * `sendTelegram` folgt exakt dem Muster von `sendMailSafe`: ohne konfiguriertes Bot-Token still
 * übersprungen (kein Wurf, kein Netzaufruf), und jeder Fehler wird gefangen — eine gescheiterte
 * Meldung darf den awaitenden Business-Flow nie mit einem 500 abbrechen.
 */

// telegram.ts zieht prisma nach sich (Verknüpfungs-Helfer). Der Versand braucht es nicht — wohl aber
// `forgetDeadChat`, das bei einem toten Chat die Verknüpfung löst.
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { updateMany: vi.fn(async () => ({ count: 1 })) } },
}));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));

const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN;
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Frisch importieren, damit das beim Modul-Laden gelesene `TELEGRAM_BOT_TOKEN` den gesetzten Wert trägt. */
async function loadWithToken(token: string | undefined) {
  vi.resetModules();
  if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = token;
  return import("./telegram");
}

describe("sendTelegram", () => {
  it("wird ohne Token still übersprungen — kein Netzaufruf, kein Wurf", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendTelegram } = await loadWithToken(undefined);

    await expect(sendTelegram("123", "hallo")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fängt einen geworfenen fetch-Fehler ab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("netz weg")));
    const { sendTelegram } = await loadWithToken("bot-token");

    await expect(sendTelegram("123", "hallo")).resolves.toBeUndefined();
  });

  it("wirft auch bei Fehler-Status nicht", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "chat not found" }));
    const { sendTelegram } = await loadWithToken("bot-token");

    await expect(sendTelegram("123", "hallo")).resolves.toBeUndefined();
  });

  it("ruft bei gesetztem Token die sendMessage-API mit chat_id und Text auf", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { sendTelegram } = await loadWithToken("bot-token");

    await sendTelegram("456", "Betreff\n\nText");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(JSON.parse(init.body)).toMatchObject({ chat_id: "456", text: "Betreff\n\nText" });
  });
});

/**
 * Der Merker der Erreichbarkeits-Probe. Beides Fehler, die nur der Zeit nach auffallen und sonst
 * still bleiben: ein gemerktes totes Ergebnis nimmt dem Nutzer den Kanal, den er gerade repariert
 * hat, und ein NICHT gemerkter Netzfehler kostet jeden Poller-Tick die vollen drei Sekunden.
 */
describe("telegramChatReachable", () => {
  it("merkt einen erreichbaren Chat und fragt nicht zweimal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { telegramChatReachable } = await loadWithToken("token:probe");

    expect(await telegramChatReachable("42")).toBe(true);
    expect(await telegramChatReachable("42")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("merkt einen TOTEN Chat nicht — die nächste Probe geht wirklich hinaus", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden: bot was blocked by the user" })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { telegramChatReachable } = await loadWithToken("token:probe");

    expect(await telegramChatReachable("42")).toBe(false);
    // Verbindet der Nutzer denselben Chat neu, muss er sofort wieder tragen können.
    expect(await telegramChatReachable("42")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("merkt einen Netzfehler kurz, statt ihn jedes Mal neu abzuwarten", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetchMock);
    const { telegramChatReachable } = await loadWithToken("token:probe");

    expect(await telegramChatReachable("42")).toBe(false);
    expect(await telegramChatReachable("42")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("merkt einen vorübergehenden Fehler-Status und lässt die Verknüpfung stehen", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "Too Many Requests" });
    vi.stubGlobal("fetch", fetchMock);
    const { telegramChatReachable } = await loadWithToken("token:probe");

    expect(await telegramChatReachable("42")).toBe(false);
    expect(await telegramChatReachable("42")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
