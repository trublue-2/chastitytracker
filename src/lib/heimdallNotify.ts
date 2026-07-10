import { prisma } from "@/lib/prisma";
import { heimdallEnabled } from "@/lib/constants";

/**
 * Instant-Push Tracker → Heimdall. Sagt dem Heimdall-Server, dass sich für einen User gerade der
 * Box-Zustand geändert hat, damit eine LIVE Box das Kommando SOFORT per MQTT bekommt — statt erst
 * beim nächsten Box-Sync (der pendingCommand-Pull bleibt der Fallback für schlafende Boxen).
 *
 * Fire-and-forget: kurzer Timeout, der Tracker-Flow darf davon NIE abhängen. Aber NICHT stumm —
 * jeder Ausfall hinterlässt eine Logzeile. Ein Instant-Push, der nie feuert, ist von aussen nicht
 * von „die Box schlief gerade" zu unterscheiden; ohne Log bleibt nur, den Pfad im Code nachzulesen.
 *
 * Auth = derselbe Shared-Secret-Bearer wie inbound (`HEIMDALL_SYNC_SECRET`), nur rückwärts —
 * Heimdall matcht ihn gegen die TrackerInstance.apiKey.
 */
export function notifyHeimdall(username: string | null | undefined, command?: "lock" | "open"): void {
  if (!username || !heimdallEnabled()) return; // Box-Kopplung ganz aus — nichts zu melden.

  // Kopplung aktiv (Secret gesetzt), aber keine Ziel-URL: das pendingCommand liegt bereit und die
  // Box holt es erst beim nächsten Sync — der Riegel folgt also auf den Tastendruck. Genau der Fall,
  // der wie ein Bug aussieht. Deshalb laut, nicht still.
  const base = process.env.HEIMDALL_BASE_URL;
  if (!base) {
    console.warn(
      "[heimdallNotify] HEIMDALL_BASE_URL nicht gesetzt — kein Instant-Push. " +
      "Die Box vollzieht das Kommando erst beim nächsten Sync (Tastendruck/Heartbeat).",
    );
    return;
  }
  const secret = process.env.HEIMDALL_SYNC_SECRET!;

  void fetch(`${base.replace(/\/$/, "")}/api/tracker/notify`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ username, command }),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (r) => {
      if (!r.ok) {
        console.warn(`[heimdallNotify] HTTP ${r.status} für ${command ?? "config-change"} — kein Instant-Push`);
        return;
      }
      // devices:0 heisst: Heimdall kennt keine Box für diesen Username (Mapping/trackerSync).
      // Der Aufruf war "erfolgreich" und hat trotzdem nichts getan.
      const body = (await r.json().catch(() => null)) as { devices?: number } | null;
      if (body?.devices === 0) {
        console.warn("[heimdallNotify] Heimdall kennt keine gemappte Box für diesen User — kein Instant-Push");
      }
    })
    .catch((e: unknown) => {
      console.warn(`[heimdallNotify] fehlgeschlagen: ${(e as Error).message} — kein Instant-Push`);
    });
}

/** Wie notifyHeimdall, löst aber den Username aus der userId auf — für Server-Flows ohne Session
 *  (Sperrzeit setzen/ändern/zurückziehen durch die KH). Fire-and-forget; no-op ohne Heimdall.
 *
 *  Prüft NUR `heimdallEnabled()` (spart den User-Lookup, wenn die Box-Kopplung ganz aus ist). Über
 *  die fehlende `HEIMDALL_BASE_URL` entscheidet allein `notifyHeimdall` — hier vorzugreifen hiesse,
 *  dessen Warnung genau für die Keyholder-Flows zu verschlucken. */
export async function notifyHeimdallForUserId(userId: string, command?: "lock" | "open"): Promise<void> {
  if (!heimdallEnabled()) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } }).catch(() => null);
  notifyHeimdall(u?.username, command);
}
