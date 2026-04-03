import { prisma } from "@/lib/prisma";

/**
 * Persistent rate limiter backed by SQLite.
 *
 * key format convention:
 *   "ip:<ip>"       — IP-based limits (forgot-password)
 *   "user:<id>"     — per-user limits (verify-kontrolle, detect-seal)
 *   "login:<name>"  — per-username login failure lockout
 *
 * @returns { limited: true, retryAfter: seconds } | { limited: false }
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ limited: boolean; retryAfter?: number }> {
  const now = new Date();
  const resetAt = new Date(Date.now() + windowMs);

  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, resetAt },
    update: {
      count: {
        // If the window has expired, restart the counter at 1; otherwise increment.
        // SQLite doesn't support conditional updates natively, so we handle expiry
        // by checking after the upsert.
        increment: 1,
      },
    },
  });

  // If the stored window has expired, reset it — this handles the "new window" case.
  if (row.resetAt < now) {
    await prisma.rateLimit.update({
      where: { key },
      data: { count: 1, resetAt },
    });
    return { limited: false };
  }

  if (row.count > limit) {
    const retryAfter = Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false };
}
