import { prisma } from "@/lib/prisma";

/**
 * Instant-Push Tracker → Heimdall (Stage 1). Sagt dem Heimdall-Server, dass sich für einen User
 * gerade der Box-Zustand geändert hat, damit eine LIVE Box das Kommando SOFORT per MQTT bekommt —
 * statt erst beim nächsten Box-Sync (der pendingCommand-Pull bleibt der Fallback für schlafende Boxen).
 *
 * Fire-and-forget: kurzer Timeout, Fehler werden verschluckt — der Tracker-Flow darf davon NIE abhängen.
 * No-op ohne `HEIMDALL_BASE_URL` oder `HEIMDALL_SYNC_SECRET`. Auth = derselbe Shared-Secret-Bearer wie
 * inbound (`HEIMDALL_SYNC_SECRET`), nur rückwärts — Heimdall matcht ihn gegen die TrackerInstance.apiKey.
 */
export function notifyHeimdall(username: string | null | undefined, command?: "lock" | "open"): void {
  const base = process.env.HEIMDALL_BASE_URL;
  const secret = process.env.HEIMDALL_SYNC_SECRET;
  if (!base || !secret || !username) return;
  void fetch(`${base.replace(/\/$/, "")}/api/tracker/notify`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ username, command }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

/** Wie notifyHeimdall, löst aber den Username aus der userId auf — für Server-Flows ohne Session
 *  (Sperrzeit setzen/ändern/zurückziehen durch die KH). Fire-and-forget; no-op ohne Heimdall-ENV. */
export async function notifyHeimdallForUserId(userId: string, command?: "lock" | "open"): Promise<void> {
  if (!process.env.HEIMDALL_BASE_URL || !process.env.HEIMDALL_SYNC_SECRET) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } }).catch(() => null);
  notifyHeimdall(u?.username, command);
}
