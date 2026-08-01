import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { loadUploadedImage } from "@/lib/imageUtils";
import { mcpImageMaxPx } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveUserContext } from "@/lib/mcp/common";
import { resolveTaskProof } from "@/lib/mcp/taskProofRef";

/**
 * Holt EIN benanntes Bild — auf Abruf, nie im Strom.
 *
 * Der Zuschnitt ist die eigentliche Entscheidung: Alle Fotos automatisch mitzuliefern wäre Rauschen
 * und würde nur wiederholen, was die Verifikation ohnehin prüft. Deshalb ein Werkzeug, das ein
 * bestimmtes Bild adressiert, und keine Erweiterung von `list_entries` um Bilddaten.
 *
 * NICHT ERREICHBAR — und das ist Absicht: `Entry.codeImageUrl`, der Bildersafe. Das versiegelte Foto
 * des Schlüsselbox-Codes wird laut Datenmodell „erst freigegeben, wenn Öffnen erlaubt ist". Ein
 * Abrufweg daran vorbei machte die Versiegelung wirkungslos, und die Codenummer stünde anschliessend
 * im Kontext eines Agenten. Wer hier eine vierte Quelle ergänzt, prüft zuerst, ob sie versiegelt ist.
 */

/** Bilder je Minute. Grosszügig für gezieltes Nachsehen (auch mal drei Aufnahmen einer Aufgabe
 *  hintereinander), eng genug, dass ein Durchlauf über das Archiv daran hängen bleibt. */
const MCP_IMAGE_RATE_LIMIT = 12;

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

/** Lädt die Datei und hängt die Bildunterschrift an. Wirft, wenn die Datei nicht lesbar ist — ein
 *  „gibt es, kann ich aber nicht laden" ist für den Aufrufer etwas anderes als „gibt es nicht". */
async function withCaption(imageUrl: string, caption: string): Promise<McpImage> {
  const img = await loadUploadedImage(imageUrl, { maxPx: mcpImageMaxPx() });
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

  // Dieselbe Bremse wie an jeder anderen Route, die ein Upload-Bild anfasst (detect-seal,
  // detect-device, verify-kontrolle). Sie ist hier nicht Zierde: seit `list_entries` eine `id`
  // trägt, hat ein Agent die vollständige Adressliste des Archivs. „Auf Abruf, nie im Strom" ist
  // eine Absicht — das Limit macht sie zu einer Eigenschaft.
  const rl = await checkRateLimit(`mcp-image:${userId}`, MCP_IMAGE_RATE_LIMIT, 60_000);
  if (rl.limited) {
    throw new Error(`Too many image requests — wait ${rl.retryAfter ?? 60}s. This tool is for looking at a specific photo, not for sweeping the archive.`);
  }

  const shotAt = (d: Date | null) => (d ? formatDateTime(d, undefined, timezone) : "capture time unknown");

  if (args.source === "task_proof") {
    if (!args.taskId || !args.proofIndex) throw new Error("source \"task_proof\" requires taskId and proofIndex.");
    const { task, proof } = await resolveTaskProof(userId, args.taskId, args.proofIndex, {
      description: true, imageUrl: true, imageExifTime: true,
    });
    if (!proof.imageUrl) throw new Error(`Proof ${args.proofIndex} of "${task.title}" has not been submitted yet.`);
    return withCaption(
      proof.imageUrl,
      `Task proof ${args.proofIndex} — "${proof.description}" (task "${task.title}", taken ${shotAt(proof.imageExifTime)})`,
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
    select: { type: true, startTime: true, imageUrl: true, boxImageUrl: true, imageExifTime: true },
  });
  if (!entry) throw new Error(`Entry not found: ${args.entryId}`);
  const when = formatDateTime(entry.startTime, undefined, timezone);

  if (args.source === "box") {
    if (!entry.boxImageUrl) throw new Error(`Entry ${args.entryId} has no box photo.`);
    return withCaption(entry.boxImageUrl, `Key-box window photo — ${entry.type} entry of ${when}`);
  }

  if (!entry.imageUrl) throw new Error(`Entry ${args.entryId} has no photo.`);
  return withCaption(entry.imageUrl, `${entry.type} entry of ${when} (photo taken ${shotAt(entry.imageExifTime)})`);
}
