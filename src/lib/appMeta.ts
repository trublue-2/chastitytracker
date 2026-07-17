import { prisma } from "@/lib/prisma";

/** Fire-and-forget: aktueller Zeitstempel für einen AppMeta-Key. */
export function touchAppMeta(key: string): void {
  const value = new Date().toISOString();
  prisma.appMeta
    .upsert({ where: { key }, create: { key, value }, update: { value } })
    .catch(() => {});
}

/** Fire-and-forget: Zeitstempel einer echten Business-Aktion, gelesen vom Portal-sync-activity-Cron via AppMeta. */
export function markLastAction(): void {
  touchAppMeta("lastActionAt");
}
