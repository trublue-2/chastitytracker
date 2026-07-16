import { prisma } from "@/lib/prisma";
// ReinigungSettings wird NUR lokal gebraucht — der Typ gehört utils.ts (wo buildPairs ihn
// definiert); MCP-Konsumenten importieren ihn von dort direkt, nicht über dieses Modul.
import { APP_TZ, type ReinigungSettings } from "@/lib/utils";
import { isoWithOffset } from "@/lib/mcp/format";
import type { DeviceMeta } from "@/lib/sessionModel";
import type { WriteContext, TxClient } from "@/lib/mcp/writeFramework";

/** Querschnitt-Helfer der MCP-V2-Schicht: User-Auflösung, Zeitformat, Inline-Notes.
 *  Alles rein additiv — kein Eingriff in Tracker-Kernlogik. */

export { APP_TZ };

/** Formatier-Funktion für ISO-8601-Zeitstempel eines bestimmten Subs (Kurzform der V2-Tools). */
export type Iso = (d: Date | null | undefined) => string | null;

/** Baut eine `iso`-Funktion, die in der Zeitzone `tz` des Ziel-Subs formatiert. Jedes Tool löst
 *  seinen einen Ziel-Sub auf und baut damit sein lokales `iso` (schattet den Modul-Default). */
export const makeIso = (tz: string): Iso => (d) => isoWithOffset(d, tz);

/** Wie {@link makeIso}, aber für Zeitpunkte, die es GARANTIERT gibt — gibt `string` statt
 *  `string | null` zurück. Sonst behilft sich jeder Aufrufer selbst: mal mit `!`, mal mit einem
 *  `as`-Cast, der das `null` nur wegdefiniert. */
export const makeFmt = (tz: string): ((d: Date) => string) => (d) => isoWithOffset(d, tz)!;

/** ISO-8601 mit APP_TZ-Offset — Fallback für Call-Sites ohne aufgelösten Sub-Kontext (bleibt
 *  byte-identisch zum bisherigen Verhalten für den Default "Europe/Zurich"). */
export const iso: Iso = makeIso(APP_TZ);

/** Löst MCP_USERNAME (Ziel der Direktiven/Abfragen) zu id + Zeitzone auf. Wirft, wenn unbekannt.
 *  Die Zeitzone des Subs regiert die Zeitdarstellung all seiner Daten. */
export async function resolveUserContext(username: string): Promise<{ id: string; timezone: string }> {
  const u = await prisma.user.findUnique({ where: { username }, select: { id: true, timezone: true } });
  if (!u) throw new Error(`User not found: ${username}`);
  return { id: u.id, timezone: u.timezone ?? APP_TZ };
}

/** Löst MCP_USERNAME zu seiner User-id auf. Wirft, wenn unbekannt. */
export async function resolveUserId(username: string): Promise<string> {
  return (await resolveUserContext(username)).id;
}

/** Zeitzone eines Subs per User-id über den gegebenen Client. `client` MUSS `tx` sein, wenn dies
 *  innerhalb eines write-apply läuft (sonst Deadlock auf der SQLite-Verbindung der offenen
 *  Transaktion); Default `prisma` für Read-Pfade. Fallback APP_TZ, wenn die Zeile fehlt. */
export async function tzOf(userId: string, client: TxClient = prisma): Promise<string> {
  const u = await client.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return u?.timezone ?? APP_TZ;
}


/** Parst einen ISO-String zu Date; wirft bei ungültigem Wert (geteilter Guardrail ALLER MCP-Tools,
 *  V1 wie V2). undefined-Input → undefined (Feld nicht gesetzt). Die Überladung hält den Rückgabetyp
 *  bei einem garantiert vorhandenen String auf `Date`, damit Aufrufer kein `!` brauchen. */
export function parseIsoDate(value: string, field: string): Date;
export function parseIsoDate(value: string | undefined, field: string): Date | undefined;
export function parseIsoDate(value: string | undefined, field: string): Date | undefined {
  if (value == null) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date for ${field}: "${value}". Use ISO 8601, e.g. 2026-06-12.`);
  }
  return d;
}

/** Ein Entry mit allen Feldern, die die V2-Read-Schicht braucht (Segmente, Kontrollen, Orgasmen). */
export interface TrackingEntry {
  id: string;
  type: string;
  startTime: Date;
  oeffnenGrund: string | null;
  orgasmusArt: string | null;
  kontrollCode: string | null;
  verifikationStatus: string | null;
  deviceCheck: string | null;
  deviceCheckNote: string | null;
  deviceCheckExpected: string | null;
  /** Siehe `Entry.keyInBox` (schema.prisma). */
  keyInBox: boolean | null;
  device: { id: string; name: string; categoryId: string | null } | null;
}

/** Vorgeladener Tracking-Kontext — erlaubt komponierenden Tools (keyholder_dashboard), Entries +
 *  Reinigung + Geräte-Meta + User-id EINMAL zu laden und an mehrere Berechnungen durchzureichen. */
export interface TrackingContext {
  userId: string;
  /** Zeitzone des Ziel-Subs — regiert die Zeitdarstellung aller seiner Daten (an komponierende
   *  Tools wie keyholder_dashboard durchgereicht, damit alle Aggregate dasselbe iso teilen). */
  timezone: string;
  entries: TrackingEntry[];
  reinigung: ReinigungSettings;
  devices: DeviceMeta[];
  now: Date;
  /** Freitext-Regeln des menschlichen Keyholders. Kommt aus derselben User-Zeile wie tz/reinigung. */
  keyholderInstructions: string | null;
}

/** Lädt resolveUserId + loadTrackingData zu einem TrackingContext (eine Quelle für komponierende Tools). */
export async function loadTrackingContext(username: string, now: Date = new Date()): Promise<TrackingContext> {
  const userId = await resolveUserId(username);
  const { entries, reinigung, devices, timezone, keyholderInstructions } = await loadTrackingData(userId);
  return { userId, timezone, entries, reinigung, devices, now, keyholderInstructions };
}

/** Lädt Entries (mit Device-Include) + Reinigungs-Settings + Geräte-Meta + Sub-Zeitzone — die geteilte
 *  Datenbasis aller V2-Read-Tools (get_session, device_stats, records, denial_trend …). */
export async function loadTrackingData(userId: string): Promise<{ entries: TrackingEntry[]; reinigung: ReinigungSettings; devices: DeviceMeta[]; timezone: string; keyholderInstructions: string | null }> {
  const [user, entries, devices] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true, timezone: true, mcpKeyholderInstructions: true } }),
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      select: {
        id: true, type: true, startTime: true, oeffnenGrund: true, orgasmusArt: true,
        kontrollCode: true, verifikationStatus: true,
        deviceCheck: true, deviceCheckNote: true, deviceCheckExpected: true, keyInBox: true,
        device: { select: { id: true, name: true, categoryId: true } },
      },
    }),
    // DeviceMeta bewusst OHNE Kategorie: dieser Kontext wird von JEDEM V2-Read geladen, die
    // Kategorie brauchen aber nur die, die Sessions/Geräte beschriften — {@link loadCategoryNames}
    // holt sie dort, wo sie gebraucht wird.
    prisma.device.findMany({ where: { userId }, select: { id: true, name: true, lookalikeClusterId: true } }),
  ]);
  return {
    entries,
    reinigung: { erlaubt: user.reinigungErlaubt ?? false, maxMinuten: user.reinigungMaxMinuten ?? 15 },
    devices,
    timezone: user.timezone ?? APP_TZ,
    keyholderInstructions: user.mcpKeyholderInstructions ?? null,
  };
}

/** Die Geräte-Kategorien eines Subs, für die Beschriftung von Sessions/Statistik-Zeilen.
 *
 *  Aus IHRER Tabelle, nicht aus den Geräten erraten: die eingebaute KG-Kategorie existiert auch dann,
 *  wenn (noch) kein KG-Gerät angelegt ist — und genau solche Alt-Verschlüsse ohne Gerät sind es, die
 *  als „ohne Gerät" gebucht sind und trotzdem als KG auszuweisen sind. `isBuiltIn` IST die
 *  KG-Kennung (es gibt genau eine eingebaute), nicht der Name — der ist frei umbenennbar. */
export async function loadCategoryNames(userId: string): Promise<{ nameById: Map<string, string>; kgName: string | null }> {
  const categories = await prisma.deviceCategory.findMany({
    where: { userId },
    select: { id: true, name: true, isBuiltIn: true },
  });
  return {
    nameById: new Map(categories.map((c) => [c.id, c.name])),
    kgName: categories.find((c) => c.isBuiltIn)?.name ?? null,
  };
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
  /** Optimistic-Concurrency-Token — bei Edits als `expectedVersion` mitgeben (siehe writeFramework). */
  version: number;
  refs: EntityRef[];
}

type NoteWithRefs = {
  id: string; type: string; status: string; pinned: boolean; source: string;
  confidence: string | null; kg: string | null; kategorie: string | null; text: string;
  doDont: string | null; validFrom: Date | null; validUntil: Date | null;
  supersedesId: string | null; createdAt: Date; version: number;
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

/** Mappt eine Note (inkl. refs) auf das stabile MCP-DTO. Zeiten in der Zeitzone des Ziel-Subs
 *  (`isoFn`); ohne expliziten Wert der APP_TZ-Default (byte-identisch zum bisherigen Verhalten). */
export function toNoteDTO(n: NoteWithRefs, isoFn: Iso = iso): NoteDTO {
  return {
    id: n.id, type: n.type, status: n.status, pinned: n.pinned, source: n.source,
    confidence: n.confidence, kg: n.kg, kategorie: n.kategorie, text: n.text,
    doDont: parseDoDont(n.doDont),
    validFrom: isoFn(n.validFrom), validUntil: isoFn(n.validUntil),
    supersedesId: n.supersedesId, createdAt: isoFn(n.createdAt)!, version: n.version,
    refs: n.refs.map((r) => ({ entityType: r.entityType as EntityType, entityId: r.entityId })),
  };
}

const noteSelect = {
  id: true, type: true, status: true, pinned: true, source: true, confidence: true,
  kg: true, kategorie: true, text: true, doDont: true, validFrom: true, validUntil: true,
  supersedesId: true, createdAt: true, version: true, refs: { select: { entityType: true, entityId: true } },
} as const;

/**
 * Lädt die aktiven Notes, die an die gegebenen Objekte hängen, in EINEM Query und gruppiert sie
 * je Objekt ("entityType:entityId" → NoteDTO[]). Damit bringt jedes geholte Objekt seine Notes
 * inline mit (§9.3) — ohne zweiten Call und ohne N+1.
 *
 * `client` MUSS der Transaktions-Client `tx` sein, wenn dies INNERHALB eines write-apply läuft —
 * sonst blockiert die Query (globaler prisma-Client) auf der vom offenen interaktiven Transaktions-
 * Lock gehaltenen SQLite-Verbindung → Deadlock/Timeout. Default `prisma` für reine Read-Tools.
 */
export async function notesForEntities(
  userId: string,
  refs: EntityRef[],
  opts: { includeSuperseded?: boolean } = {},
  client: TxClient = prisma,
  tz: string = APP_TZ,
): Promise<Map<string, NoteDTO[]>> {
  const out = new Map<string, NoteDTO[]>();
  if (refs.length === 0) return out;
  const isoFn = makeIso(tz);

  const notes = await client.keyholderNote.findMany({
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
    const dto = toNoteDTO(n, isoFn);
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
