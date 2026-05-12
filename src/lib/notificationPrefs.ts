import { prisma } from "@/lib/prisma";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/constants";

/** Seed NotificationPreference rows for a user with default-on values.
 *  Skips event types that already have a row (preserves explicit opt-outs). */
export async function ensureNotificationPreferences(userId: string) {
  await Promise.all(
    NOTIFICATION_EVENT_TYPES.map((eventType) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId, eventType } },
        update: {},
        create: { userId, eventType, mail: true, push: true },
      })
    )
  );
}
