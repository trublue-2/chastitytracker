import { prisma } from "@/lib/prisma";
import { formatDateTime, isTimeCorrected } from "@/lib/utils";
import { resolveUserContext } from "@/lib/mcp/common";

/**
 * `list_entries` — die ROH-Einträge, ungefiltert und unaggregiert.
 *
 * Das einzige Tool ohne aggregierende Sicht: es zeigt, was tatsächlich in der Tabelle steht. Es hatte
 * nie eine V2-Entsprechung und hat den Wegfall der V1-Read-Schicht deshalb überlebt — die anderen
 * V1-Tools waren Aggregate, die V2 besser beantwortet.
 *
 * Zeiten bewusst im menschenlesbaren Instanz-Format (nicht ISO): dieses Tool wird gelesen, nicht
 * weiterverrechnet.
 */

/** Geräte-Check eines Eintrags ins MCP-Format (status/detected/expected) oder null. */
function mapDeviceCheck(e: { deviceCheck: string | null; deviceCheckNote: string | null; deviceCheckExpected: string | null }) {
  return e.deviceCheck ? { status: e.deviceCheck, detected: e.deviceCheckNote, expected: e.deviceCheckExpected } : null;
}

export interface EntryRow {
  /** One of VALID_TYPES: VERSCHLUSS | OEFFNEN | PRUEFUNG | ORGASMUS | WEAR_BEGIN | WEAR_END */
  type: string;
  time: string;
  /** Free-text note / comment the user attached to the entry. */
  note: string | null;
  /** Opening reason for OEFFNEN entries (REINIGUNG | KEYHOLDER | NOTFALL | ANDERES). */
  oeffnenGrund: string | null;
  /** Orgasm type for ORGASMUS entries (e.g. "Orgasmus", "ruinierter Orgasmus", "feuchter Traum"). */
  orgasmusArt: string | null;
  kontrollCode: string | null;
  verifikationStatus: string | null;
  deviceName: string | null;
  /** Geräte-Check aus dem Kontroll-Foto (nur PRUEFUNG, advisory): wurde das verschlossene Gerät
   *  erkannt? status: "ok" = passendes Gerät · "wrong" = anderes/keins zugeordnet · "missing" = kein
   *  Gerät sichtbar. detected = im Foto erkanntes Gerät, expected = das verschlossene (Soll-)Gerät.
   *  null = nicht geprüft (z.B. nicht verschlossen oder keine Referenzfotos hinterlegt). */
  deviceCheck: { status: string; detected: string | null; expected: string | null } | null;
  hasImage: boolean;
  imageExifTime: string | null;
  /** True when the entered time differs from the creation time (back-/post-dated). */
  timeCorrected: boolean;
}

export interface EntryList {
  schemaVersion: 1;
  user: string;
  generatedAt: string;
  timezone: string;
  /** Total entries matching the filter, before the limit is applied. */
  totalCount: number;
  returnedCount: number;
  entries: EntryRow[];
}

export interface ListEntriesOptions {
  /** Filter by entry type (one of VALID_TYPES). Omit for all types. */
  type?: string;
  /** Max rows (default 50, clamped to 1..200). */
  limit?: number;
}

/** Lists raw entries with full per-entry detail, newest first. Throws if the user does not exist. */
export async function listEntries(username: string, opts: ListEntriesOptions = {}): Promise<EntryList> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const typeFilter = opts.type?.trim().toUpperCase();
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const where = { userId, ...(typeFilter ? { type: typeFilter } : {}) };

  const [totalCount, entries] = await Promise.all([
    prisma.entry.count({ where }),
    prisma.entry.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: limit,
      include: { device: { select: { name: true } } },
    }),
  ]);

  return {
    schemaVersion: 1 as const,
    user: username,
    generatedAt: formatDateTime(new Date(), undefined, timezone),
    timezone,
    totalCount,
    returnedCount: entries.length,
    entries: entries.map((e) => ({
      type: e.type,
      time: formatDateTime(e.startTime, undefined, timezone),
      note: e.note,
      oeffnenGrund: e.oeffnenGrund,
      orgasmusArt: e.orgasmusArt,
      kontrollCode: e.kontrollCode,
      verifikationStatus: e.verifikationStatus,
      deviceName: e.device?.name ?? null,
      deviceCheck: mapDeviceCheck(e),
      hasImage: !!e.imageUrl,
      imageExifTime: e.imageExifTime ? formatDateTime(e.imageExifTime, undefined, timezone) : null,
      timeCorrected: isTimeCorrected(e.startTime, e.createdAt),
    })),
  };
}
