import { prisma } from "@/lib/prisma";
import { formatDateTime, isTimeCorrected } from "@/lib/utils";
import { effectiveDeviceCheckStatus } from "@/lib/deviceCheck";
import { toVerifyFailure, type VerifyFailure } from "@/lib/verifyReason";
import { resolveUserContext, buildEnvelope, makeIso, mcpDeviceCheckStatus, type Envelope, type McpDeviceCheckStatus } from "@/lib/mcp/common";

/**
 * `list_entries` — die ROH-Einträge, ungefiltert und unaggregiert.
 *
 * Das einzige Tool ohne aggregierende Sicht: es zeigt, was tatsächlich in der Tabelle steht. Es hatte
 * nie eine V2-Entsprechung und hat den Wegfall der V1-Read-Schicht deshalb überlebt — die anderen
 * V1-Tools waren Aggregate, die V2 besser beantwortet.
 *
 * Zeiten PRO EINTRAG (`time`, `imageExifTime`) bewusst im menschenlesbaren Instanz-Format (nicht
 * ISO): dieses Tool wird gelesen, nicht weiterverrechnet. Ausnahme: `generatedAt` im Envelope ist wie
 * bei jedem anderen MCP-Tool ISO-8601 mit Offset — es ist der maschinell vergleichbare Zeitanker
 * (A-08), kein Anzeigefeld, und muss über alle Tools hinweg gleich formatiert bleiben.
 */

/** Geräte-Check eines Eintrags ins MCP-Format (status/detected/expected) oder null. Der DB-Wert
 *  "error" (nicht prüfbar, Admin-UI-Feinheit) fällt im MCP bewusst auf "not_checked" — ein Check,
 *  der nicht laufen konnte, ist für die Keyholder-KI „nicht geprüft" (deckt sich mit der explain_model-
 *  Beschreibung, z.B. keine Referenzfotos). Der genaue Grund bleibt der menschlichen Admin-Sicht. */
function mapDeviceCheck(e: { deviceCheck: string | null; deviceCheckNote: string | null; deviceCheckExpected: string | null }) {
  if (!e.deviceCheck) return null;
  const status = effectiveDeviceCheckStatus(e.deviceCheck, e.deviceCheckNote);
  return { status: mcpDeviceCheckStatus(status), detected: e.deviceCheckNote, expected: e.deviceCheckExpected };
}

export interface EntryRow {
  /** Stabile Adresse des Eintrags. Bis dahin trug diese Liste nur Merkmale, keine Kennung — ein
   *  einzelner Eintrag liess sich damit beschreiben, aber nicht ansprechen. */
  id: string;
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
  /** Warum die automatische Code-Verifikation NICHT gematcht hat (nur PRUEFUNG); null = gematcht,
   *  nie gelaufen, oder vom Keyholder von Hand beurteilt. Ohne dieses Feld ist ein
   *  `verifikationStatus: null` nicht deutbar — „unverifiziert", aber ohne erkennbaren Grund. */
  verifikationFailure: VerifyFailure | null;
  deviceName: string | null;
  /** Geräte-Check aus dem Kontroll-Foto (nur PRUEFUNG, advisory): wurde das verschlossene Gerät
   *  erkannt? status: "ok" = passendes Gerät · "wrong" = ein anderes, BENANNTES Gerät (detected ist
   *  dann immer gesetzt) · "missing" = kein Gerät sichtbar · "not_checked" = nicht geprüft oder nicht
   *  prüfbar (nicht verschlossen, keine Referenzfotos, Gerät sichtbar aber nicht zuordenbar).
   *  detected = im Foto erkanntes Gerät, expected = das verschlossene (Soll-)Gerät. */
  deviceCheck: { status: McpDeviceCheckStatus; detected: string | null; expected: string | null } | null;
  hasImage: boolean;
  /** Ob eine Aufnahme durch das Sichtfenster der Schlüsselbox vorliegt. Steht neben `hasImage`, weil
   *  es dieselbe Frage für die zweite Aufnahme beantwortet — ohne das Feld wäre nur zu erraten, ob
   *  ein Eintrag überhaupt eines hat. */
  hasBoxImage: boolean;
  imageExifTime: string | null;
  /** True when the entered time differs from the creation time (back-/post-dated). */
  timeCorrected: boolean;
}

export interface EntryList extends Envelope {
  /** v2: `generatedAt` ist jetzt ISO-8601 mit Offset (wie bei jedem anderen MCP-Tool), vorher ein
   *  lokalisierter Anzeige-String (`formatDateTime`) — Format-Wechsel eines bestehenden Felds, siehe
   *  CLAUDE.md „MCP schemaVersion-Disziplin". Die restlichen Felder sind unverändert.
   *  v3: `deviceCheck.status` „wrong" setzt jetzt ein benanntes `detected` voraus; „Gerät sichtbar,
   *  aber keiner Referenz zuzuordnen" liefert „not_checked" statt „wrong". Das gilt auch rückwirkend
   *  für gespeicherte Alt-Einträge — ein v2-„wrong" ohne `detected` kann in v3 „not_checked" sein.
   *  v4: neue Stufe `deviceCheck.status: "pending"` (Erkennung läuft noch). Bis v3 war eine frisch
   *  eingereichte Kontrolle von einer fertig-geprüften ohne Befund nicht zu unterscheiden — beide
   *  „not_checked"; ab v4 ist „not_checked" endgültig. Additiv daneben: `verifikationFailure`.   *  v5: `verifikationStatus` kann jetzt „not_required" sein — das getragene Gerät verlangt keinen
   *  Kontroll-Code (`Device.requireInspectionCode: false`), es war also nichts zu prüfen. Bis v4
   *  wäre derselbe Fall als `null` („unverifiziert") erschienen und hätte wie ein Fehlschlag gelesen. */
  schemaVersion: 5;
  user: string;
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
  const iso = makeIso(timezone);
  const now = new Date();
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
    schemaVersion: 5 as const,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    totalCount,
    returnedCount: entries.length,
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      time: formatDateTime(e.startTime, undefined, timezone),
      note: e.note,
      oeffnenGrund: e.oeffnenGrund,
      orgasmusArt: e.orgasmusArt,
      kontrollCode: e.kontrollCode,
      verifikationStatus: e.verifikationStatus,
      verifikationFailure: toVerifyFailure(e.verifikationStatus, e.verifikationReason, e.verifikationReasonDetected),
      deviceName: e.device?.name ?? null,
      deviceCheck: mapDeviceCheck(e),
      hasImage: !!e.imageUrl,
      hasBoxImage: !!e.boxImageUrl,
      imageExifTime: e.imageExifTime ? formatDateTime(e.imageExifTime, undefined, timezone) : null,
      timeCorrected: isTimeCorrected(e.startTime, e.createdAt),
    })),
  };
}
