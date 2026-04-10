import { headers } from "next/headers";

export async function logAccess(adminName: string, path: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[ACCESS] ${ts} | ${adminName} | ${path} | ${ip}`);
}
