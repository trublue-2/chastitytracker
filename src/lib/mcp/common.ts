import { prisma } from "@/lib/prisma";
import { APP_TZ } from "@/lib/utils";
import { isoWithOffset } from "@/lib/mcp/format";
import type { WriteContext } from "@/lib/mcp/writeFramework";

/** Querschnitt-Helfer der MCP-V2-Schicht: User-Auflösung, Zeitformat, Inline-Notes.
 *  Alles rein additiv — kein Eingriff in Tracker-Kernlogik. */

export { APP_TZ };

/** ISO-8601 mit Instanz-Offset (Kurzform für die V2-Tools). */
export const iso = (d: Date | null | undefined): string | null => isoWithOffset(d, APP_TZ);

/** Löst MCP_USERNAME (Ziel der Direktiven/Abfragen) zu seiner User-id auf. Wirft, wenn unbekannt. */
export async function resolveUserId(username: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!u) throw new Error(`User not found: ${username}`);
  return u.id;
}

/** Baut den WriteContext (Ziel-User + handelnder Keyholder) für das Write-Framework. */
export async function buildWriteContext(username: string, actorUserId?: string): Promise<WriteContext> {
  return { targetUserId: await resolveUserId(username), targetUsername: username, actorUserId };
}

/** Mögliche Objekt-Typen, an die eine Note hängen kann (NoteRef.entityType). */
export type EntityType =
  | "device" | "session" | "segment" | "control" | "offense"
  | "orgasmDirective" | "goal" | "appointment";

export interface EntityRef {
  entityType: EntityType;
  entityId: string;
}

/** Kompakte Note-Darstellung, wie sie inline an Objekten und in query_notes erscheint. */
export interface NoteDTO {
  id: string;
  type: string;
  status: string;
  pinned: boolean;
  source: string;
  confidence: string | null;
  kg: string | null;
  kategorie: string | null;
  text: string;
  doDont: { do: string[]; dont: string[] } | null;
  validFrom: string | null;
  validUntil: string | null;
  supersedesId: string | null;
  createdAt: string;
  refs: EntityRef[];
}

type NoteWithRefs = {
  id: string; type: string; status: string; pinned: boolean; source: string;
  confidence: string | null; kg: string | null; kategorie: string | null; text: string;
  doDont: string | null; validFrom: Date | null; validUntil: Date | null;
  supersedesId: string | null; createdAt: Date;
  refs: { entityType: string; entityId: string }[];
};

/** Coerced einen bereits geparsten Wert zu string[] (nicht-Strings/Nicht-Arrays → []). */
function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

/** Parst ein JSON-codiertes string[] robust; [] bei leer/ungültig. Geteilt von Notes (doDont) und
 *  Geräte-Metadaten (healthFlags). */
export function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return coerceStringArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Parst das doDont-JSON robust in {do, dont}; null bei leer/ungültig. */
function parseDoDont(raw: string | null): { do: string[]; dont: string[] } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return { do: coerceStringArray(v?.do), dont: coerceStringArray(v?.dont) };
  } catch {
    return null;
  }
}

/** Mappt eine Note (inkl. refs) auf das stabile MCP-DTO. */
export function toNoteDTO(n: NoteWithRefs): NoteDTO {
  return {
    id: n.id, type: n.type, status: n.status, pinned: n.pinned, source: n.source,
    confidence: n.confidence, kg: n.kg, kategorie: n.kategorie, text: n.text,
    doDont: parseDoDont(n.doDont),
    validFrom: iso(n.validFrom), validUntil: iso(n.validUntil),
    supersedesId: n.supersedesId, createdAt: iso(n.createdAt)!,
    refs: n.refs.map((r) => ({ entityType: r.entityType as EntityType, entityId: r.entityId })),
  };
}

const noteSelect = {
  id: true, type: true, status: true, pinned: true, source: true, confidence: true,
  kg: true, kategorie: true, text: true, doDont: true, validFrom: true, validUntil: true,
  supersedesId: true, createdAt: true, refs: { select: { entityType: true, entityId: true } },
} as const;

/**
 * Lädt die aktiven Notes, die an die gegebenen Objekte hängen, in EINEM Query und gruppiert sie
 * je Objekt ("entityType:entityId" → NoteDTO[]). Damit bringt jedes geholte Objekt seine Notes
 * inline mit (§9.3) — ohne zweiten Call und ohne N+1.
 */
export async function notesForEntities(
  userId: string,
  refs: EntityRef[],
  opts: { includeSuperseded?: boolean } = {},
): Promise<Map<string, NoteDTO[]>> {
  const out = new Map<string, NoteDTO[]>();
  if (refs.length === 0) return out;

  const notes = await prisma.keyholderNote.findMany({
    where: {
      userId,
      ...(opts.includeSuperseded ? {} : { status: "active" }),
      refs: { some: { OR: refs.map((r) => ({ entityType: r.entityType, entityId: r.entityId })) } },
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: noteSelect,
  });

  const wanted = new Set(refs.map((r) => `${r.entityType}:${r.entityId}`));
  for (const n of notes) {
    const dto = toNoteDTO(n);
    for (const r of n.refs) {
      const key = `${r.entityType}:${r.entityId}`;
      if (!wanted.has(key)) continue;
      let list = out.get(key);
      if (!list) out.set(key, (list = []));
      list.push(dto);
    }
  }
  return out;
}

/** Schlüssel für die notesForEntities-Map. */
export const entityKey = (type: EntityType, id: string): string => `${type}:${id}`;

export { noteSelect };
