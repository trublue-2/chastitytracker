import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** Send a push notification to all subscriptions belonging to a user. */
export async function sendPushToUser(
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
