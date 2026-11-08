import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Push-Zustellung: Zeitlimits und der Weg über native Tokens.
 *
 * Echte Dienste (APNs, FCM, Push-Endpunkte) sind hier nicht erreichbar und sollen es nicht sein: es
 * wird geprüft, WAS die Zustellung an sie schickt (Zeitlimit, Signal), nicht ob sie antworten.
 */
const { sendNotification, nativeTokens, subscriptions, deleteTokens } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  nativeTokens: vi.fn(),
  subscriptions: vi.fn(),
  deleteTokens: vi.fn(),
}));

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    nativePushToken: { findMany: nativeTokens, deleteMany: deleteTokens },
    pushSubscription: { findMany: subscriptions, deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/pushEndpoint", () => ({ isAllowedPushEndpoint: () => true }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Zeitlimits", () => {
  it("ohne eingerichteten nativen Versand zählt kein Token — Web-Push läuft, kein fetch geht raus", async () => {
    // Ein Token, an den nichts zugestellt werden kann (z.B. Android-Alt-Zeile ohne FCM-Schlüssel),
    // darf die Web-Push nicht unterdrücken: die Abfrage fragt gar keine Plattform ab.
    nativeTokens.mockResolvedValue([]);
    subscriptions.mockResolvedValue([{ id: "s1", endpoint: "https://push.example/x", p256dh: "k", auth: "a" }]);
    sendNotification.mockResolvedValue({});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendPushToUser } = await import("./push");
    await sendPushToUser("u1", "Titel", "Text", "/x");
    expect(nativeTokens).toHaveBeenCalledWith({ where: { userId: "u1", platform: { in: [] } } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledOnce();
  });

  it("Android: Versand über FCM v1 mit url, Zähler und Zeitlimit; nur ein abgemeldeter Token wird entfernt", async () => {
    const { generateKeyPairSync } = await import("crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify({
      project_id: "proj",
      client_email: "push@proj.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      token_uri: "https://oauth2.googleapis.com/token",
    }));
    nativeTokens.mockResolvedValue([
      { id: "a1", token: "fcm-ok", platform: "android" },
      { id: "a2", token: "fcm-gone", platform: "android" },
      { id: "a3", token: "fcm-foreign", platform: "android" },
    ]);
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }));
      const msg = JSON.parse(String(init.body)).message;
      if (msg.token === "fcm-ok") return new Response("{}", { status: 200 });
      if (msg.token === "fcm-gone") return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
      // Falscher Service-Account: Konfigurations-Fehler, der Token bleibt.
      return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", details: [{ errorCode: "SENDER_ID_MISMATCH" }] } }), { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendPushToUser } = await import("./push");
    await sendPushToUser("u1", "Titel", "Text", "/x", 3);

    expect(nativeTokens).toHaveBeenCalledWith({ where: { userId: "u1", platform: { in: ["android"] } } });
    const send = fetchMock.mock.calls.find(([u]) => String(u).includes("fcm.googleapis.com"))!;
    expect(send[0]).toBe("https://fcm.googleapis.com/v1/projects/proj/messages:send");
    const init = send[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer at");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const msg = JSON.parse(String(init.body)).message;
    expect(msg.data).toEqual({ url: "/x" });
    expect(msg.android.notification.notification_count).toBe(3);
    expect(deleteTokens).toHaveBeenCalledWith({ where: { id: { in: ["a2"] } } });
    // Native App vorhanden → keine parallele Web-Push.
    expect(subscriptions).not.toHaveBeenCalled();
  });

  it("Web-Push: sendNotification bekommt ein Zeitlimit", async () => {
    nativeTokens.mockResolvedValue([]);
    subscriptions.mockResolvedValue([{ id: "s1", endpoint: "https://push.example/x", p256dh: "k", auth: "a" }]);
    sendNotification.mockResolvedValue({});
    const { sendPushToUser } = await import("./push");
    await sendPushToUser("u1", "Titel", "Text");
    expect(sendNotification).toHaveBeenCalledOnce();
    const opts = sendNotification.mock.calls[0][2] as { timeout?: number };
    expect(opts.timeout).toBe(10_000);
  });
});
