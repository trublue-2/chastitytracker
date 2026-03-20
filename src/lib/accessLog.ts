import { headers } from "next/headers";

export async function logAccess(userId: string, username: string, path: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";

  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[ACCESS] ${ts} | ${username} (${userId}) | ${path} | ${ip}`);
}
