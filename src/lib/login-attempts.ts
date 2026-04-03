import { prisma } from "@/lib/prisma";

const KEY = (username: string) => `login:${username}`;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Returns true if the user is allowed to attempt login. */
export async function checkRateLimit(username: string): Promise<boolean> {
  const row = await prisma.rateLimit.findUnique({ where: { key: KEY(username) } });
  if (!row) return true;
  if (row.count >= MAX_FAILURES && row.resetAt > new Date()) return false;
  return true;
}

/** Record a failed login attempt. Triggers a 15-min lockout after 5 failures. */
export async function recordFailure(username: string): Promise<void> {
  const key = KEY(username);
  const lockoutEnd = new Date(Date.now() + LOCKOUT_MS);

  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  if (!existing || (existing.count >= MAX_FAILURES && existing.resetAt <= new Date())) {
    // No record or expired lockout — start fresh
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt: lockoutEnd },
      update: { count: 1, resetAt: lockoutEnd },
    });
    return;
  }

  const newCount = existing.count + 1;
  if (newCount >= MAX_FAILURES) {
    await prisma.rateLimit.update({
      where: { key },
      data: { count: newCount, resetAt: lockoutEnd },
    });
    console.warn(
      `${new Date().toISOString()} [auth] Login für "${username}" für 15 min gesperrt (zu viele Fehlversuche)`
    );
  } else {
    await prisma.rateLimit.update({ where: { key }, data: { count: newCount } });
  }
}

/** Clear failure record on successful login. */
export async function recordSuccess(username: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: KEY(username) } });
}

/** Returns the lockout expiry date, or null if not locked. */
export async function getBlockedUntil(username: string): Promise<Date | null> {
  const row = await prisma.rateLimit.findUnique({ where: { key: KEY(username) } });
  if (!row || row.count < MAX_FAILURES) return null;
  if (row.resetAt <= new Date()) return null;
  return row.resetAt;
}
