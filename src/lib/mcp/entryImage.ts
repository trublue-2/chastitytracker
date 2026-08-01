import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { loadUploadedImage } from "@/lib/imageUtils";
import { checkRateLimit } from "@/lib/rate-limit";
import { structuredLog } from "@/lib/serverLog";
import {
  mcpImageMaxPx, MCP_IMAGE_MAX_AGE_MS, MCP_IMAGE_PER_HOUR, MCP_IMAGE_PER_DAY,
} from "@/lib/constants";
import { resolveUserContext } from "@/lib/mcp/common";
import { resolveTaskProof } from "@/lib/mcp/taskProofRef";

/**
 * Holt EIN benanntes Bild — auf Abruf, nie im Strom.
 *
 * Der Zuschnitt ist die eigentliche Entscheidung: Alle Fotos automatisch mitzuliefern wäre Rauschen
 * und würde nur wiederholen, was die Verifikation ohnehin prüft. Deshalb ein Werkzeug, das ein
 * bestimmtes Bild adressiert, und keine Erweiterung von `list_entries` um Bilddaten.
 *
 * ZWECK — und damit die Begründung der 24-h-Reichweite: Dies ist die Grundlage für das GESPRÄCH über
 * das, was gerade war. Es ist AUSDRÜCKLICH NICHT die primäre Verifikation der Kontrollen; die läuft
 * getrennt über `verifyCode.ts`/`deviceCheckService.ts` und ist von diesem Werkzeug unabhängig.
 * Daraus folgt auch, dass ein Nachweis, der länger als 24 h auf Sichtung wartet, hier bewusst nicht
 * mehr sichtbar ist: das Urteil braucht das Bild nicht, das Gespräch schon — und das findet zeitnah
 * statt. Wer die Reichweite später verlängern will, prüft zuerst, ob sich dieser Zweck geändert hat.
 *
 * NICHT ERREICHBAR — und das ist Absicht: `Entry.codeImageUrl`, der Bildersafe. Das versiegelte Foto
 * des Schlüsselbox-Codes wird laut Datenmodell „erst freigegeben, wenn Öffnen erlaubt ist". Ein
 * Abrufweg daran vorbei machte die Versiegelung wirkungslos, und die Codenummer stünde anschliessend
 * im Kontext eines Agenten. Wer hier eine vierte Quelle ergänzt, prüft zuerst, ob sie versiegelt ist.
 */

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Der Sub-Schlüssel: `MCP_IMAGE_KEY` muss die `User.id` des `MCP_USERNAME` sein.
 *
 * Gebunden wird damit an den SUB, nicht an die Instanz — was für diesen Server dasselbe ist („one
 * server = one sub"), aber den Unterschied macht, wenn `MCP_USERNAME` je auf einen anderen Benutzer
 * zeigt oder der Benutzer gelöscht und neu angelegt wird: dann passt der Schlüssel nicht mehr, und
 * die Funktion fällt aus. Genau das ist auch der Zweck — ein blosses `true` wanderte mit einer
 * kopierten `.env` mit, eine id, die in DEREN Datenbank niemandem gehört, nicht.
 *
 * Es ist eine BINDUNG, kein Geheimnis: die id steht in den Admin-URLs, und wer die `.env` bearbeiten
 * kann, besitzt ohnehin den Server.
 *
 * Fail-closed, aber nicht stumm: der GRUND geht als Logzeile raus, damit ein Tippfehler von einer
 * nicht erreichbaren Datenbank zu unterscheiden ist. Der erwartete Wert steht bewusst NICHT im Log.
 */
async function mcpImageKeyState(): Promise<"unlocked" | "locked" | "unknown"> {
  // Wie beim Instructions-Read nebenan: zur Build-/Edge-Zeit gar nicht erst fragen.
  if (process.env.NEXT_RUNTIME !== "nodejs") return "locked";
  const key = process.env.MCP_IMAGE_KEY?.trim();
  const username = process.env.MCP_USERNAME;
  if (!key || !username) {
    structuredLog("MCP", "image-locked", { reason: !key ? "no_key" : "no_username" });
    return "locked";
  }
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (user?.id === key) return "unlocked";
    structuredLog("MCP", "image-locked", { reason: user ? "key_mismatch" : "unknown_user" });
    return "locked";
  } catch (e) {
    structuredLog("MCP", "image-locked", { reason: "db_error", error: (e as Error).message });
    return "unknown";
  }
}

/** Darf ausgeliefert werden? Nur bei einem eindeutigen Ja — „weiss nicht" reicht nicht. */
export async function mcpImageKeyUnlocked(): Promise<boolean> {
  return (await mcpImageKeyState()) === "unlocked";
}

/**
 * Darf das Werkzeug in der Liste ERSCHEINEN? Hier genügt „nicht eindeutig nein".
 *
 * Der Unterschied ist eine Betriebs-Eigenschaft, keine Sicherheits-Lücke: Der Handler wird EINMAL
 * pro Prozess gebaut. Trifft der erste MCP-Request ein, während die Datenbank noch nicht antwortet
 * (Migration beim Container-Start), fiele das Werkzeug bis zum nächsten Neustart aus der Liste —
 * ohne Selbstheilung und für den Betreiber nur an einer Logzeile erkennbar. Ein Ausfall ist aber
 * kein Nein.
 *
 * Sichtbar heisst deshalb nicht erreichbar: `deliver()` prüft den Schlüssel bei JEDER Auslieferung
 * erneut und streng. Im Zweifelsfall erscheint also ein Werkzeug, das so lange ablehnt, bis die
 * Datenbank wieder antwortet — statt eines, das verschwunden bleibt.
 */
export async function mcpImageToolVisible(): Promise<boolean> {
  return (await mcpImageKeyState()) !== "locked";
}

/** Die drei erreichbaren Quellen. `entry` = Gerät/Siegel bzw. das Kontrollfoto, `box` = Aufnahme
 *  durch das Sichtfenster der Schlüsselbox, `task_proof` = eingereichter Aufgaben-Nachweis. */
export type McpImageSource = "entry" | "box" | "task_proof";

/** Die Adresse. Welches Feld zu welcher Quelle gehört, steht in den zod-Beschreibungen des
 *  Werkzeugs — sie sind der Text, den der Agent liest, und bleiben die eine Quelle dafür. */
export interface McpImageArgs {
  source: McpImageSource;
  entryId?: string;
  taskId?: string;
  proofIndex?: number;
}

export interface McpImage {
  base64: string;
  mediaType: string;
  /** Woher das Bild stammt und wann es aufgenommen wurde. Ohne diese Zeile ist ein Bild im Kontext
   *  nicht mehr einzuordnen — welcher Eintrag, welcher Zeitpunkt, welche Art. */
  caption: string;
}

/**
 * Der EINE Durchgang, durch den jedes ausgelieferte Bild läuft: Schlüssel, Reichweite, Kontingent,
 * laden, beschriften.
 *
 * Dass alle drei Quellen hier durchmüssen, IST die Zusage. Stünden die Prüfungen verstreut in
 * `loadMcpImage`, wären sie eine Reihenfolge — und eine Reihenfolge kann man beim nächsten Umbau
 * verlieren. `deliver` kann man nicht vergessen: es liefert den Rückgabewert.
 *
 * `recordedAt` ist der Zeitpunkt der ERFASSUNG (`createdAt` / `submittedAt`), nicht die Ereigniszeit:
 * `startTime` ist vom Sub verstellbar, und ein zurückdatierter Eintrag würde sonst sein eigenes Foto
 * unerreichbar machen. Der Eingang lässt sich nicht verstellen.
 *
 * Das Kontingent zählt AUSLIEFERUNGEN, nicht Versuche — ein Griff nach einem zu alten Bild kostet
 * nichts. (Einzige Kante: eine unlesbare Datei verbraucht es trotzdem. Andersherum wäre das
 * Kontingent gegen wiederholte Ladeversuche wehrlos.)
 */
async function deliver(userId: string, imageUrl: string, caption: string, recordedAt: Date | null): Promise<McpImage> {
  if (!(await mcpImageKeyUnlocked())) {
    throw new Error("Image access is not unlocked on this instance.");
  }

  const maxAgeH = Math.round(MCP_IMAGE_MAX_AGE_MS / HOUR_MS);
  if (!recordedAt || Date.now() - recordedAt.getTime() > MCP_IMAGE_MAX_AGE_MS) {
    throw new Error(`${caption} — older than ${maxAgeH}h. Images are only available while the entry is fresh; this is a rule, not a fault. Ask the user directly if you need to see it.`);
  }

  // Stunde ZUERST, Tag danach. Beide Aufrufe zählen hoch, auch wenn der zweite ablehnt — deshalb die
  // Reihenfolge: läuft man gegen die Stundenwand, bleibt das Tagesbudget unberührt.
  const hour = await checkRateLimit(`mcp-image-h:${userId}`, MCP_IMAGE_PER_HOUR, HOUR_MS);
  if (hour.limited) {
    throw new Error(`Hourly image limit reached (${MCP_IMAGE_PER_HOUR}/h) — retry in ${hour.retryAfter ?? HOUR_MS / 1000}s.`);
  }
  const day = await checkRateLimit(`mcp-image-d:${userId}`, MCP_IMAGE_PER_DAY, DAY_MS);
  if (day.limited) {
    throw new Error(`Daily image limit reached (${MCP_IMAGE_PER_DAY}/day) — retry in ${day.retryAfter ?? DAY_MS / 1000}s.`);
  }

  const img = await loadUploadedImage(imageUrl, { maxPx: mcpImageMaxPx() });
  // „Gibt es, kann ich aber nicht laden" ist für den Aufrufer etwas anderes als „gibt es nicht".
  if (!img) throw new Error(`Image file could not be read (${caption}).`);
  return { base64: img.base64, mediaType: img.mediaType, caption };
}

/**
 * Löst die Adresse auf und liefert das Bild.
 *
 * Jede Abfrage filtert auf die aufgelöste `userId` — der MCP hängt zwar ohnehin an genau einem
 * Benutzer (`MCP_USERNAME`), aber eine id aus einer fremden Instanz darf auch dann nicht auflösen,
 * wenn sie zufällig existiert.
 */
export async function loadMcpImage(username: string, args: McpImageArgs): Promise<McpImage> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const shotAt = (d: Date | null) => (d ? formatDateTime(d, undefined, timezone) : "capture time unknown");

  if (args.source === "task_proof") {
    if (!args.taskId || !args.proofIndex) throw new Error("source \"task_proof\" requires taskId and proofIndex.");
    const { task, proof } = await resolveTaskProof(userId, args.taskId, args.proofIndex, {
      description: true, imageUrl: true, imageExifTime: true, submittedAt: true,
    });
    if (!proof.imageUrl) throw new Error(`Proof ${args.proofIndex} of "${task.title}" has not been submitted yet.`);
    return deliver(
      userId,
      proof.imageUrl,
      `Task proof ${args.proofIndex} — "${proof.description}" (task "${task.title}", taken ${shotAt(proof.imageExifTime)})`,
      proof.submittedAt,
    );
  }

  if (args.source !== "entry" && args.source !== "box") {
    // Fail-closed als COMPILE-Zusage: die Bindung an `never` bricht den Build, sobald jemand
    // `McpImageSource` erweitert, ohne den Fall hier zu behandeln.
    const unhandled: never = args.source;
    throw new Error(`Unknown source: ${unhandled}`);
  }
  if (!args.entryId) throw new Error(`source "${args.source}" requires entryId.`);

  const entry = await prisma.entry.findFirst({
    where: { id: args.entryId, userId },
    select: { type: true, startTime: true, createdAt: true, imageUrl: true, boxImageUrl: true, imageExifTime: true },
  });
  if (!entry) throw new Error(`Entry not found: ${args.entryId}`);
  const when = formatDateTime(entry.startTime, undefined, timezone);

  if (args.source === "box") {
    if (!entry.boxImageUrl) throw new Error(`Entry ${args.entryId} has no box photo.`);
    return deliver(userId, entry.boxImageUrl, `Key-box window photo — ${entry.type} entry of ${when}`, entry.createdAt);
  }

  if (!entry.imageUrl) throw new Error(`Entry ${args.entryId} has no photo.`);
  return deliver(userId, entry.imageUrl, `${entry.type} entry of ${when} (photo taken ${shotAt(entry.imageExifTime)})`, entry.createdAt);
}
