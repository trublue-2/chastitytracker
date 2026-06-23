import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/serverLog";

const plog = (label: string, fields: Record<string, unknown>) => structuredLog("push", label, fields);

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
// Native push (APNs / FCM) — active only when credentials are configured.
//
// APNs (iOS):  APNS_KEY_PATH + APNS_KEY_ID + APNS_TEAM_ID + APNS_BUNDLE_ID
// FCM (Android): FCM_SERVER_KEY
// ---------------------------------------------------------------------------

const APNS_KEY_PATH    = process.env.APNS_KEY_PATH;    // path to .p8 file (local dev)
const APNS_KEY_CONTENT = process.env.APNS_KEY_CONTENT;  // raw .p8 content (server/Docker)
const APNS_KEY_ID      = process.env.APNS_KEY_ID;
const APNS_TEAM_ID     = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID   = process.env.APNS_BUNDLE_ID;    // e.g. ch.chastitytracker.app
const FCM_SERVER_KEY   = process.env.FCM_SERVER_KEY;

/** Send via APNs (HTTP/2). */
async function sendApns(token: string, title: string, body: string, url?: string): Promise<NativeSendResult> {
  const hasKey = APNS_KEY_PATH || APNS_KEY_CONTENT;
  if (!hasKey || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID) {
    plog("apns:not_configured", {});
    return { ok: false, invalid: false };
  }
  try {
    const { createSign } = await import("crypto");

    let key: string;
    if (APNS_KEY_CONTENT) {
      key = APNS_KEY_CONTENT.replace(/\\n/g, "\n"); // support escaped newlines in env vars
    } else {
      const { default: fs } = await import("fs");
      key = fs.readFileSync(APNS_KEY_PATH!, "utf8");
    }
    const now = Math.floor(Date.now() / 1000);

    // JWT for APNs provider auth token
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })).toString("base64url");
    const sig = createSign("SHA256").update(`${header}.${claims}`).sign({ key, dsaEncoding: "ieee-p1363" });
    const jwt = `${header}.${claims}.${sig.toString("base64url")}`;

    const payload = JSON.stringify({
      aps: { alert: { title, body }, badge: 1, sound: "default" },
      ...(url ? { url } : {}),
    });

    // APNS_SANDBOX=true  → sandbox (dev builds via Xcode)
    // APNS_SANDBOX unset → production (TestFlight / App Store)
    const host = process.env.APNS_SANDBOX === "true"
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";

    const { default: https } = await import("https");
    return new Promise((resolve) => {
      const req = https.request(
        {
          host,
          path: `/3/device/${token}`,
          method: "POST",
          headers: {
            "authorization": `bearer ${jwt}`,
            "apns-topic": APNS_BUNDLE_ID!,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          if (res.statusCode === 200) { resolve({ ok: true, invalid: false }); return; }
          let data = "";
          res.on("data", (c: Buffer) => (data += c));
          res.on("end", () => {
            let reason = "";
            try { reason = (JSON.parse(data) as { reason?: string })?.reason ?? ""; } catch { /* nicht-JSON */ }
            // Nur diese Reasons bedeuten einen definitiv toten Token → löschen erlaubt.
            // (DeviceTokenNotForTopic = Topic-/Sandbox-Mismatch = Config-Fehler → Token NICHT löschen!)
            const invalid = res.statusCode === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
            plog("apns:failed", { status: res.statusCode, reason, invalid });
            resolve({ ok: false, invalid });
          });
        }
      );
      req.on("error", (e) => { plog("apns:error", { error: (e as Error).message }); resolve({ ok: false, invalid: false }); });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    plog("apns:exception", { error: (err as Error).message });
    return { ok: false, invalid: false };
  }
}

/** Send via FCM legacy API. */
async function sendFcm(token: string, title: string, body: string, url?: string): Promise<NativeSendResult> {
  if (!FCM_SERVER_KEY) {
    plog("fcm:not_configured", {});
    return { ok: false, invalid: false };
  }
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Authorization": `key=${FCM_SERVER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body },
        data: url ? { url } : undefined,
        priority: "high",
      }),
    });
    if (!res.ok) {
      plog("fcm:failed", { status: res.status });
      return { ok: false, invalid: false }; // HTTP-Fehler = transient → Token behalten
    }
    // FCM-Legacy liefert 200 auch bei totem Token; der Grund steht im Body.
    const json = (await res.json().catch(() => null)) as { results?: { error?: string }[] } | null;
    const err = json?.results?.[0]?.error ?? "";
    const invalid = err === "NotRegistered" || err === "InvalidRegistration";
    if (err) plog("fcm:result_error", { error: err, invalid });
    return { ok: !err, invalid };
  } catch (err) {
    plog("fcm:exception", { error: (err as Error).message });
    return { ok: false, invalid: false };
  }
}

/** Send native push to all registered device tokens for a user. Liefert true, wenn der Nutzer native
 *  Tokens hat (= native App vorhanden) — damit der Aufrufer die parallele Web-Push unterdrücken kann. */
async function sendNativePushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<boolean> {
  const tokens = await prisma.nativePushToken.findMany({ where: { userId } });
  plog("native:tokens", { userId, count: tokens.length });
  if (tokens.length === 0) return false;

  const invalidIds: string[] = [];

  await Promise.allSettled(
    tokens.map(async (t) => {
      const r = t.platform === "ios"
        ? await sendApns(t.token, title, body, url)
        : await sendFcm(t.token, title, body, url);
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

/** Send a push notification to all subscriptions belonging to a user. */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  // Native bevorzugen: hat der Nutzer eine native App (≥1 Token), NUR nativ senden — sonst öffnet die
  // parallele Web-Push die Home-Screen-PWA statt der App. Web-Push nur als Fallback ohne native App.
  const hasNative = await sendNativePushToUser(userId, title, body, url);
  if (!hasNative) await sendWebPushToUser(userId, title, body, url);
}

async function sendWebPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { plog("web:not_configured", {}); return; }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  plog("web:subs", { userId, count: subscriptions.length });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url });
  const stale: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { urgency: "high", TTL: 86400 }
        );
      } catch (err: unknown) {
        // 404/410 means the subscription is no longer valid — remove it
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.id);
        } else {
          console.error("[push] sendNotification failed for", sub.id, err);
        }
      }
    })
  );

  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }
}
