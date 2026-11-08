import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/serverLog";
import { isAllowedPushEndpoint } from "@/lib/pushEndpoint";
import { apnsProviderToken, resetApnsTokenCache } from "@/lib/apnsAuth";
import { fcmAccessToken, parseServiceAccount, resetFcmTokenCache, type FcmServiceAccount } from "@/lib/fcmAuth";
import { NATIVE_PLATFORMS, type NativePlatform } from "@/lib/nativePlatforms";

const plog = (label: string, fields: Record<string, unknown>) => structuredLog("push", label, fields);

/** Zeitlimit EINES Push-Aufrufs an einen externen Dienst (APNs, Web-Push-Endpunkt). Ein
 *  hängender Dienst darf den awaitenden Aufrufer nicht festhalten — dieselben 10 s wie bei Telegram. */
const PUSH_TIMEOUT_MS = 10_000;

/** Ergebnis eines nativen Send-Versuchs. invalid=true NUR bei definitiv totem Token (Gerät
 *  deinstalliert / Token rotiert) → dann darf gelöscht werden. Transiente Fehler (Timeout, 429,
 *  5xx, Config-Mismatch) lassen invalid=false → Token bleibt erhalten. */
type NativeSendResult = { ok: boolean; invalid: boolean };

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// Native push — je Plattform aktiv, sobald ihre Zugangsdaten gesetzt sind.
//
// APNs (iOS):     APNS_KEY_PATH | APNS_KEY_CONTENT + APNS_KEY_ID + APNS_TEAM_ID + APNS_BUNDLE_ID
// FCM (Android):  FCM_SERVICE_ACCOUNT_PATH | FCM_SERVICE_ACCOUNT_JSON (Service-Account des Firebase-Projekts)
// ---------------------------------------------------------------------------

const APNS_KEY_PATH    = process.env.APNS_KEY_PATH;    // path to .p8 file (local dev)
const APNS_KEY_CONTENT = process.env.APNS_KEY_CONTENT;  // raw .p8 content (server/Docker)
const APNS_KEY_ID      = process.env.APNS_KEY_ID;
const APNS_TEAM_ID     = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID   = process.env.APNS_BUNDLE_ID;    // e.g. ch.chastitytracker.app

/** Der APNs-Schlüssel — aus der ENV oder asynchron von der Platte (nie `readFileSync` im Request-Pfad). */
async function loadApnsKey(): Promise<string> {
  if (APNS_KEY_CONTENT) return APNS_KEY_CONTENT.replace(/\\n/g, "\n"); // escaped newlines in env vars
  const { default: fs } = await import("fs");
  return fs.promises.readFile(APNS_KEY_PATH!, "utf8");
}

function apnsConfigured(): boolean {
  return Boolean((APNS_KEY_PATH || APNS_KEY_CONTENT) && APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID);
}

/** Send via APNs (HTTP/2). `badge` = ungelesene Nachrichten; siehe sendPushToUser. */
async function sendApns(token: string, title: string, body: string, url?: string, badge?: number): Promise<NativeSendResult> {
  if (!apnsConfigured()) {
    plog("apns:not_configured", {});
    return { ok: false, invalid: false };
  }
  try {
    // Der Provider-Token (und damit der Schlüssel) wird gemerkt, nicht je Push neu gebaut.
    const jwt = await apnsProviderToken({ keyId: APNS_KEY_ID!, teamId: APNS_TEAM_ID!, loadKey: loadApnsKey });

    // Ohne `badge` bleibt das Feld WEG — ein Payload ohne badge lässt das bestehende App-Badge
    // unverändert. Eine feste 0 einzusetzen würde jede Meldung, die keine Nachricht begleitet
    // (z.B. an die Keyholder), zum Badge-Löscher machen.
    const payload = JSON.stringify({
      aps: { alert: { title, body }, ...(badge !== undefined ? { badge } : {}), sound: "default" },
      ...(url ? { url } : {}),
    });

    // APNs spricht AUSSCHLIESSLICH HTTP/2 → http2-Modul (HTTP/1.1 via https.request scheitert mit
    // "Parse Error: Expected HTTP/, RTSP/ or ICE/"). APNS_SANDBOX=true → Sandbox (Xcode-Dev),
    // unset/false → Production (TestFlight/App Store).
    const authority = process.env.APNS_SANDBOX === "true"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

    const { default: http2 } = await import("http2");
    return new Promise((resolve) => {
      const client = http2.connect(authority);
      let settled = false;
      const finish = (r: NativeSendResult) => {
        if (settled) return;
        settled = true;
        client.close();
        resolve(r);
      };
      const fail = (e: Error) => { plog("apns:error", { error: e.message }); finish({ ok: false, invalid: false }); };
      client.on("error", fail);
      client.setTimeout(PUSH_TIMEOUT_MS, () => { plog("apns:timeout", {}); finish({ ok: false, invalid: false }); });

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        "authorization": `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID!,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });

      let status = 0;
      let data = "";
      req.on("response", (headers) => { status = Number(headers[":status"]) || 0; });
      req.setEncoding("utf8");
      req.on("data", (c) => (data += c));
      req.on("error", fail);
      req.on("end", () => {
        if (status === 200) { finish({ ok: true, invalid: false }); return; }
        let reason = "";
        try { reason = (JSON.parse(data) as { reason?: string })?.reason ?? ""; } catch { /* nicht-JSON */ }
        // Nur diese Reasons bedeuten einen definitiv toten Token → löschen erlaubt.
        // (DeviceTokenNotForTopic = Topic-/Sandbox-Mismatch = Config-Fehler → Token NICHT löschen!)
        const invalid = status === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
        // Ein abgelehnter Provider-Token (Uhr, Schlüsselwechsel) bliebe sonst bis zum Ablauf der
        // Wiederverwendung im Merker: beim nächsten Push neu bauen.
        if (status === 403 && (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken")) resetApnsTokenCache();
        plog("apns:failed", { status, reason, invalid });
        finish({ ok: false, invalid });
      });
      req.end(payload);
    });
  } catch (err) {
    plog("apns:exception", { error: (err as Error).message });
    return { ok: false, invalid: false };
  }
}

const FCM_SERVICE_ACCOUNT_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH; // Datei (Instanz-Volume)
const FCM_SERVICE_ACCOUNT_JSON = process.env.FCM_SERVICE_ACCOUNT_JSON; // Inhalt direkt (Docker-ENV)

function fcmConfigured(): boolean {
  return Boolean(FCM_SERVICE_ACCOUNT_PATH || FCM_SERVICE_ACCOUNT_JSON);
}

let fcmAccount: Promise<FcmServiceAccount> | null = null;
/** Die Service-Account-Datei einmal lesen (asynchron, nie `readFileSync` im Request-Pfad). Ein
 *  Lesefehler wird nicht gemerkt — sonst bliebe ein einmal fehlendes Volume bis zum Neustart stumm. */
function loadFcmAccount(): Promise<FcmServiceAccount> {
  if (!fcmAccount) {
    fcmAccount = (async () => {
      if (FCM_SERVICE_ACCOUNT_JSON) return parseServiceAccount(FCM_SERVICE_ACCOUNT_JSON);
      const { default: fs } = await import("fs");
      return parseServiceAccount(await fs.promises.readFile(FCM_SERVICE_ACCOUNT_PATH!, "utf8"));
    })();
    fcmAccount.catch(() => { fcmAccount = null; });
  }
  return fcmAccount;
}

/** Send via FCM HTTP v1. `badge` → `notification_count` (Launcher-Zähler, wo der Launcher ihn zeigt). */
async function sendFcm(token: string, title: string, body: string, url?: string, badge?: number): Promise<NativeSendResult> {
  if (!fcmConfigured()) {
    plog("fcm:not_configured", {});
    return { ok: false, invalid: false };
  }
  try {
    const sa = await loadFcmAccount();
    const accessToken = await fcmAccessToken(sa, PUSH_TIMEOUT_MS);
    const message = {
      token,
      notification: { title, body },
      // Das Antippen liest `data.url` (NativePushRouter) — wie das `url`-Feld neben `aps` bei APNs.
      ...(url ? { data: { url } } : {}),
      android: {
        priority: "HIGH",
        notification: { sound: "default", ...(badge !== undefined ? { notification_count: badge } : {}) },
      },
    };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, invalid: false };

    const err = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; details?: { errorCode?: string }[] };
    };
    const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? "";
    // Nur ein definitiv toter Token darf weg: UNREGISTERED (App deinstalliert, Token rotiert). Wie bei
    // APNs (`DeviceTokenNotForTopic`) ist ein Konfigurations-Fehler KEIN Grund zum Löschen —
    // SENDER_ID_MISMATCH oder ein 404 auf das Projekt kommen auch von einem falschen Service-Account,
    // und dann verlören alle Android-Geräte der Instanz ihre Anmeldung. Alt-Zeilen der Legacy-FCM-Zeit
    // räumt die Migration `drop_legacy_android_push_tokens` ab.
    const invalid = code === "UNREGISTERED";
    if (res.status === 401) resetFcmTokenCache();
    plog("fcm:failed", { status: res.status, code, invalid });
    return { ok: false, invalid };
  } catch (err) {
    plog("fcm:exception", { error: (err as Error).message });
    return { ok: false, invalid: false };
  }
}

type NativeSender = {
  configured: () => boolean;
  send: (token: string, title: string, body: string, url?: string, badge?: number) => Promise<NativeSendResult>;
};

/** Ein Sender je Plattform — `Record` statt `if`, damit eine neue Plattform ohne Sender nicht kompiliert. */
const NATIVE_SENDERS: Record<NativePlatform, NativeSender> = {
  ios: { configured: apnsConfigured, send: sendApns },
  android: { configured: fcmConfigured, send: sendFcm },
};

/** Die Plattformen, deren Versand auf dieser Instanz eingerichtet ist (ENV, also fest je Prozess).
 *  Nur deren Tokens zählen als „native App vorhanden" — ein Token, an den nichts zugestellt werden
 *  kann, darf die Web-Push nicht unterdrücken (das betraf Android-Alt-Zeilen der Legacy-FCM-Zeit). */
const DELIVERABLE_PLATFORMS: NativePlatform[] = NATIVE_PLATFORMS.filter((p) => NATIVE_SENDERS[p].configured());

/** Kann diese Instanz an `platform` zustellen? Die Registrierung nimmt nur solche Geräte an — sonst
 *  meldete die App „Push an", und es käme nie etwas (die WebView hat auch keine Web-Push). */
export function isDeliverablePlatform(platform: unknown): platform is NativePlatform {
  return (DELIVERABLE_PLATFORMS as unknown[]).includes(platform);
}

/** Send native push to all registered device tokens for a user. Liefert true, wenn der Nutzer native
 *  Tokens hat (= native App vorhanden) — damit der Aufrufer die parallele Web-Push unterdrücken kann. */
async function sendNativePushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
  badge?: number
): Promise<boolean> {
  const tokens = await prisma.nativePushToken.findMany({ where: { userId, platform: { in: DELIVERABLE_PLATFORMS } } });
  plog("native:tokens", { userId, count: tokens.length });
  if (tokens.length === 0) return false;

  const invalidIds: string[] = [];

  await Promise.allSettled(
    tokens.map(async (t) => {
      const r = await NATIVE_SENDERS[t.platform as NativePlatform].send(t.token, title, body, url, badge);
      plog("native:result", { platform: t.platform, ok: r.ok, invalid: r.invalid });
      // NUR definitiv tote Tokens entfernen — transiente Fehler dürfen den Token nicht vernichten.
      if (r.invalid) invalidIds.push(t.id);
    })
  );

  if (invalidIds.length > 0) {
    plog("native:prune", { count: invalidIds.length });
    await prisma.nativePushToken.deleteMany({ where: { id: { in: invalidIds } } });
  }
  return true;
}

/**
 * Erreicht eine Push diesen Nutzer überhaupt — hat er also mindestens ein angemeldetes Ziel?
 *
 * Hier und nicht beim Aufrufer: WELCHE Tabellen ein Push-Ziel darstellen, weiss dieses Modul, und
 * es ist dieselbe Reihenfolge, die `sendPushToUser` beim Senden anwendet (nativ zuerst, Web nur als
 * Ersatz). Stünde die Frage anderswo, hätte ein dritter Kanal zwei Stellen zu ändern — und die
 * vergessene wäre die, die dem Nutzer sagt, seine Meldungen seien aus.
 *
 * Gebraucht von Aktionen, die der Nutzer AUSLÖST und deren einziges Ergebnis eine Push ist (heute
 * die Code-Wiederholung an der Kontrolle): der Versand selbst kann nicht
 * beantworten, ob überhaupt jemand zuhört — ohne diese Vorabfrage meldete der Knopf Erfolg und auf
 * dem Gerät bliebe es still.
 */
export async function hasPushTarget(userId: string): Promise<boolean> {
  if (await prisma.nativePushToken.findFirst({ where: { userId, platform: { in: DELIVERABLE_PLATFORMS } }, select: { id: true } })) return true;
  return (await prisma.pushSubscription.findFirst({ where: { userId }, select: { id: true } })) !== null;
}

/** Fire-and-forget-Push: schluckt JEDEN Fehler. Zwingend für unawaited Aufrufe — `sendPushToUser`
 *  fängt intern NICHT alles (die Prisma-Reads/Cleanups laufen ausserhalb try/catch), ein Reject
 *  eines unawaited Promise würde sonst als unhandledRejection den Prozess beenden. */
export function firePush(userId: string, title: string, body: string, url?: string, badge?: number): void {
  sendPushToUser(userId, title, body, url, badge).catch((e: unknown) => {
    plog("fire_failed", { userId, error: (e as Error).message });
  });
}

/**
 * Send a push notification to all subscriptions belonging to a user.
 *
 * `badge` = Anzahl UNGELESENER NACHRICHTEN, serverseitig gezählt. Vorher stand hier die feste `1`:
 * zehn Meldungen ergaben 1, und weil ein Payload ohne `badge`-Feld das bestehende Badge unverändert
 * lässt, blieb die 1 nativ für immer stehen. Ohne Wert wird das Feld weggelassen — ein Push, der
 * keine Nachricht begleitet, lässt das Badge in Ruhe, statt es zu erfinden ODER zu löschen.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
  badge?: number
): Promise<void> {
  // Native bevorzugen: hat der Nutzer eine native App (≥1 Token), NUR nativ senden — sonst öffnet die
  // parallele Web-Push die Home-Screen-PWA statt der App. Web-Push nur als Fallback ohne native App.
  const hasNative = await sendNativePushToUser(userId, title, body, url, badge);
  if (!hasNative) await sendWebPushToUser(userId, title, body, url, badge);
}

async function sendWebPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
  badge?: number
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { plog("web:not_configured", {}); return; }

  const stored = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  // Abos aus der Zeit vor der Endpunkt-Prüfung (`subscribe`): eine Adresse, die kein Push-Dienst
  // vergibt, wird nicht angefragt (SSRF). Bewusst NICHT gelöscht: fehlte der Liste ein echter
  // Dienst, ginge sonst das Abo aller seiner Nutzer unwiederbringlich verloren — übersprungen ist
  // es mit einem Eintrag in `pushEndpoint.ts` wieder da.
  const subscriptions = stored.filter((s) => isAllowedPushEndpoint(s.endpoint));
  const stale: string[] = []; // 404/410 — nur diese werden gelöscht
  plog("web:subs", { userId, count: subscriptions.length, rejected: stale.length });
  if (subscriptions.length === 0) return;

  // Wie bei APNs: `unread` nur mitsenden, wenn es einen Wert gibt (siehe sw.js).
  const payload = JSON.stringify({ title, body, url, ...(badge !== undefined ? { unread: badge } : {}) });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { urgency: "high", TTL: 86400, timeout: PUSH_TIMEOUT_MS }
        );
      } catch (err: unknown) {
        // 404/410 means the subscription is no longer valid — remove it
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.id);
        } else {
          plog("web:send_failed", { subscriptionId: sub.id, status: status ?? "none", error: (err as Error).message });
        }
      }
    })
  );

  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }
}
