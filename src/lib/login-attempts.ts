// In-memory rate limiting: max 5 failures per username, 15 min lockout

const loginAttempts = new Map<string, { failures: number; blockedUntil: Date | null }>();

export function checkRateLimit(username: string): boolean {
  const entry = loginAttempts.get(username);
  if (!entry) return true;
  if (entry.blockedUntil && entry.blockedUntil > new Date()) return false;
  return true;
}

export function recordFailure(username: string): void {
  const entry = loginAttempts.get(username) ?? { failures: 0, blockedUntil: null };
  entry.failures += 1;
  if (entry.failures >= 5) {
    entry.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    console.warn(`${new Date().toISOString()} [auth] Login für "${username}" für 15 min gesperrt (zu viele Fehlversuche)`);
  }
  loginAttempts.set(username, entry);
}

export function recordSuccess(username: string): void {
  loginAttempts.delete(username);
}

export function getBlockedUntil(username: string): Date | null {
  const entry = loginAttempts.get(username);
  if (!entry?.blockedUntil) return null;
  if (entry.blockedUntil <= new Date()) return null;
  return entry.blockedUntil;
}
