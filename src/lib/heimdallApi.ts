import { prisma } from "@/lib/prisma";
import { heimdallConfigured } from "@/lib/constants";

/**
 * Ein Aufruf an den Heimdall-Server — die EINE Stelle, die Adresse und Anmeldung zusammensetzt.
 * Auth = derselbe Shared-Secret-Bearer wie inbound (`HEIMDALL_SYNC_SECRET`), nur rückwärts; Heimdall
 * matcht ihn gegen die `TrackerInstance.apiKey`.
 *
 * `null` = kein Ziel: die Box-Kopplung ist aus, oder `HEIMDALL_BASE_URL` fehlt. Was dann geschieht,
 * entscheidet der Aufrufer (laut warnen, still nichts tun, Funktion ausblenden).
 */
export function heimdallFetch(path: string, init: RequestInit & { timeoutMs: number }): Promise<Response> | null {
  if (!heimdallConfigured()) return null;
  const { timeoutMs, headers, ...rest } = init;
  return fetch(`${process.env.HEIMDALL_BASE_URL!.replace(/\/$/, "")}${path}`, {
    ...rest,
    headers: { authorization: `Bearer ${process.env.HEIMDALL_SYNC_SECRET}`, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Heimdall kennt einen Träger unter seinem Tracker-Usernamen (`Device.trackerUsername`). `null` =
 *  den User gibt es nicht (mehr). */
export async function heimdallUsername(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } }).catch(() => null);
  return u?.username ?? null;
}
