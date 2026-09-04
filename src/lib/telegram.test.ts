import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * `sendTelegram` folgt exakt dem Muster von `sendMailSafe`: ohne konfiguriertes Bot-Token still
 * übersprungen (kein Wurf, kein Netzaufruf), und jeder Fehler wird gefangen — eine gescheiterte
 * Meldung darf den awaitenden Business-Flow nie mit einem 500 abbrechen.
 */

// telegram.ts zieht prisma nach sich (Verknüpfungs-Helfer); der Versand braucht es nicht.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
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
