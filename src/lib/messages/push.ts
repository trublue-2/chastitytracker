import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/serverLog";
import { isAllowedPushEndpoint } from "@/lib/messages/pushEndpoint";
import { apnsProviderToken, resetApnsTokenCache } from "@/lib/messages/apnsAuth";

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
// Native push (APNs) — active only when credentials are configured.
//
// APNs (iOS):  APNS_KEY_PATH + APNS_KEY_ID + APNS_TEAM_ID + APNS_BUNDLE_ID
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

/** Send via APNs (HTTP/2). `badge` = ungelesene Nachrichten; siehe sendPushToUser. */
async function sendApns(token: string, title: string, body: string, url?: string, badge?: number): Promise<NativeSendResult> {
  const hasKey = APNS_KEY_PATH || APNS_KEY_CONTENT;
  if (!hasKey || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID) {
    plog("apns:not_configured", {});
    return { ok: false, invalid: false };
  }
  try {
    // Der Provider-Token (und damit der Schlüssel) wird gemerkt, nicht je Push neu gebaut.
    const jwt = await apnsProviderToken({ keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, loadKey: loadApnsKey });

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

/** Send native push to all registered device tokens for a user. Liefert true, wenn der Nutzer native
 *  Tokens hat (= native App vorhanden) — damit der Aufrufer die parallele Web-Push unterdrücken kann. */
async function sendNativePushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
  badge?: number
): Promise<boolean> {
  // Nur iOS: Alt-Zeilen mit platform "android" (Legacy-FCM, abgeschaltet) werden weder bedient noch
  // unterdrücken sie die Web-Push. Bewusst nicht gelöscht — kein Datenverlust, kein Schema-Eingriff.
  const tokens = await prisma.nativePushToken.findMany({ where: { userId, platform: "ios" } });
  plog("native:tokens", { userId, count: tokens.length });
  if (tokens.length === 0) return false;

  const invalidIds: string[] = [];

  await Promise.allSettled(
    tokens.map(async (t) => {
      const r = await sendApns(t.token, title, body, url, badge);
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
  if (await prisma.nativePushToken.findFirst({ where: { userId, platform: "ios" }, select: { id: true } })) return true;
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
