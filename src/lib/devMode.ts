/**
 * Dev-Mode helpers for test-enablement on localhost.
 *
 * Used to lift non-security validations (e.g. date restrictions) when the app
 * is being tested locally. The bypass requires BOTH:
 *   - NODE_ENV !== "production" (so production builds can never activate it)
 *   - Request host is localhost / 127.0.0.1 (safety net)
 */

export function isDevBypassEnabled(host: string | null | undefined): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!host) return false;
  return (
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:")
  );
}
