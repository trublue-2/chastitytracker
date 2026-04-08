import webpush from "web-push";
import { prisma } from "@/lib/prisma";

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

const APNS_KEY_PATH  = process.env.APNS_KEY_PATH;   // path to .p8 file
const APNS_KEY_ID    = process.env.APNS_KEY_ID;
const APNS_TEAM_ID   = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID;   // e.g. ch.chastitytracker.app
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;

/** Send via APNs (HTTP/2). Returns true on success. */
async function sendApns(token: string, title: string, body: string, url?: string): Promise<boolean> {
  if (!APNS_KEY_PATH || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID) return false;
  try {
    const { default: fs } = await import("fs");
    const { createSign } = await import("crypto");

    const key = fs.readFileSync(APNS_KEY_PATH, "utf8");
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

    const host = process.env.NODE_ENV === "production"
      ? "api.push.apple.com"
      : "api.sandbox.push.apple.com";

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
          if (res.statusCode === 200) { resolve(true); return; }
          let data = "";
          res.on("data", (c: Buffer) => (data += c));
          res.on("end", () => {
            console.error("[push/apns] failed", res.statusCode, data);
            resolve(false);
          });
        }
      );
      req.on("error", (e) => { console.error("[push/apns] error", e); resolve(false); });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.error("[push/apns] unexpected error", err);
    return false;
  }
}

/** Send via FCM legacy API. Returns true on success. */
async function sendFcm(token: string, title: string, body: string, url?: string): Promise<boolean> {
  if (!FCM_SERVER_KEY) return false;
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
      console.error("[push/fcm] failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[push/fcm] unexpected error", err);
    return false;
  }
}

/** Send native push to all registered device tokens for a user. */
async function sendNativePushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  const tokens = await prisma.nativePushToken.findMany({ where: { userId } });
  if (tokens.length === 0) return;

  const stale: string[] = [];

  await Promise.allSettled(
    tokens.map(async (t) => {
      const ok = t.platform === "ios"
        ? await sendApns(t.token, title, body, url)
        : await sendFcm(t.token, title, body, url);

      if (!ok) stale.push(t.id);
    })
  );

  // Remove tokens that failed (device uninstalled / token rotated)
  if (stale.length > 0) {
    await prisma.nativePushToken.deleteMany({ where: { id: { in: stale } } });
  }
}

/** Send a push notification to all subscriptions belonging to a user. */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  // Run web push and native push in parallel.
  await Promise.allSettled([
    sendWebPushToUser(userId, title, body, url),
    sendNativePushToUser(userId, title, body, url),
  ]);
}

async function sendWebPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });
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

/** Send a push notification to all subscriptions belonging to all admins. */
export async function sendPushToAdmins(
  title: string,
  body: string,
  url?: string
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });
  await Promise.allSettled(admins.map((a) => sendPushToUser(a.id, title, body, url)));
}
