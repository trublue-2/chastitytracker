import { headers } from "next/headers";
import { appendFile, mkdir } from "fs/promises";
import { join } from "path";

export async function logAccess(userId: string, username: string, path: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const userAgent = h.get("user-agent") ?? "unknown";

  const logDir = join(process.cwd(), "data", "logs");
  await mkdir(logDir, { recursive: true });

  const entry =
    JSON.stringify({ ts: new Date().toISOString(), userId, username, ip, userAgent, path }) + "\n";

  await appendFile(join(logDir, "access.log"), entry, "utf8");
}
