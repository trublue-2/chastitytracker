import { prisma } from "@/lib/prisma";
import { mcpStrafbuch, type OffenseJudgment, type StrafbuchOverview, type StrafbuchControlRow } from "@/lib/mcpOverview";
import { resolveUserContext, notesForEntities, entityKey, makeIso, type NoteDTO } from "@/lib/mcp/common";
import { STORED_TYPE, type OffenseCanonicalType } from "@/lib/strafurteilService";

/** Disziplin-Ledger (§4) — vereinheitlicht die getrennten Strafbuch-Kategorien zu EINER
 *  Offense-Liste mit durchgängiger Taxonomie, open-vs-judged, Auslöser und Folge. Reines
 *  MCP-Post-Processing über mcpStrafbuch — KEIN Eingriff in buildStrafbuch (Tracker-Core).
 *
 *  Cluster-Softening (§3.1/§5.3): das erwartete Gerät eines wrongDevice-Vergehens liegt nicht im
 *  Strafbuch-Output und liesse sich nur über Detection-Logik im Core rekonstruieren. Daher hängen
 *  wir den Cluster/securityLevel des GETRAGENEN Geräts als Kontext an (`deviceCluster`) und
 *  markieren `possiblyClusterInternal`, statt automatisch zu verwerfen — die Entscheidung trifft
 *  der Keyholder via judge_offense. */

/** Kanonische Offense-Taxonomie — ABGELEITET, nicht abgeschrieben. Die handgeführte Kopie hatte
 *  `auto_removed_control` nie mitbekommen und driftete still von der Wahrheit weg (`STORED_TYPE`).
 *  Genau dieselbe Klasse Fehler liess `get_offenses` eine ganze Vergehens-Kategorie unterschlagen. */
export const OFFENSE_TYPES = Object.keys(STORED_TYPE) as OffenseCanonicalType[];

export interface OffenseRow {
  id: string;
  type: string;
  /** ISO-8601 mit Offset (mcpStrafbuch wird mit iso:true komponiert). */
  detectedAt: string | null;
  status: "open" | "judged";
  judgment: OffenseJudgment["judgment"];
  /** Verhängte Folge (Freitext-Strafe) inkl. Erledigt-Status, falls bestraft. */
  consequence: { text: string | null; done: boolean; doneAt: string | null } | null;
  dismissReason: string | null;
  judgedBy: string | null;
  judgedAt: string | null;
  /** Typ-spezifischer Kontext (Zeiten, Gerät, Nachricht …). */
  context: Record<string, unknown>;
  notes: NoteDTO[];
}

export interface LedgerResult {
  schemaVersion: 2;
  user: string;
  generatedAt: string;
  timezone: string;
  detectedOffenseCount: number;
  openOffenseCount: number;
  pendingPenaltyCount: number;
  offenses: OffenseRow[];
}

/** Baut die gemeinsamen Ledger-Felder aus einem OffenseJudgment + Detektionszeit + Kontext. */
function toRow(detectedAt: string | null, j: OffenseJudgment, context: Record<string, unknown>): OffenseRow {
  return {
    id: j.ref.id,
    type: j.ref.type,
    detectedAt,
    status: j.judgment === "open" ? "open" : "judged",
    judgment: j.judgment,
    consequence: j.judgment === "punished" ? { text: j.penalty, done: j.done, doneAt: j.doneAt } : null,
    dismissReason: j.judgment === "dismissed" ? j.reason : null,
    judgedBy: j.judgedBy,
    judgedAt: j.judgedAt,
    context,
    notes: [],
  };
}

/** Die drei Kontroll-Kategorien (verspätet / abgelehnt / auto-entfernt) teilen sich Zeile UND
 *  Kontext — nur `lateControls` trägt zusätzlich `backdated`. Vorher stand dieser Kontext dreimal
 *  wortgleich da, und genau so verschwand `autoRemovedControls`: eine Kopie zu wenig. */
function controlRows(
  rows: StrafbuchControlRow[],
  extra: (c: StrafbuchControlRow) => Record<string, unknown> = () => ({}),
): OffenseRow[] {
  return rows.map((c) => toRow(c.entryTime ?? c.deadline, c, {
    code: c.code, deadline: c.deadline, fulfilledAt: c.fulfilledAt,
    comment: c.comment, entryNote: c.entryNote, ...extra(c),
  }));
}

/** Kontext eines Geräts für die wrongDevice-Cluster-Softening — mehr braucht der Zeilenbau nicht. */
export type DeviceCluster = { lookalikeClusterId: string | null; securityLevel: string | null };

/**
 * Strafbuch-Kategorien → EINE Offense-Liste. Rein und exportiert, weil hier der Vertrag sitzt, den
 * `get_offenses` gebrochen hat: JEDE Kategorie, die in `detectedOffenseCount` zählt, muss hier auch
 * eine Zeile bekommen. Fehlt eine (`autoRemovedControls` fehlte), meldet das Dashboard ein offenes
 * Vergehen, das im Ledger nicht auftaucht — und ohne `ref` kann der Keyholder es nicht beurteilen.
 * `ledger.test.ts` hält das gegen `OFFENSE_TYPES` fest.
 */
export function buildOffenseRows(
  sb: StrafbuchOverview,
  clusterByName: Map<string, DeviceCluster>,
): OffenseRow[] {
  return [
    ...sb.unauthorizedOpenings.map((o) => toRow(o.time, o, { note: o.note, lockPeriodEndedAt: o.lockPeriodEndedAt, lockPeriodIndefinite: o.lockPeriodIndefinite })),
    ...controlRows(sb.lateControls, (c) => ({ backdated: c.backdated })),
    ...controlRows(sb.rejectedControls),
    ...controlRows(sb.autoRemovedControls),
    ...sb.cleaningLimitViolations.map((v) => toRow(v.time, v, { note: v.note })),
    ...sb.wrongDeviceViolations.map((v) => {
      const dev = v.deviceName ? clusterByName.get(v.deviceName) : null;
      return toRow(v.time, v, {
        note: v.note,
        deviceName: v.deviceName,
        deviceCluster: dev?.lookalikeClusterId ?? null,
        deviceSecurityLevel: dev?.securityLevel ?? null,
        // Hinweis: erwartetes Gerät liegt nicht vor → echte Cluster-Prüfung braucht Keyholder-Urteil.
        possiblyClusterInternal: dev?.lookalikeClusterId != null,
      });
    }),
    ...sb.missedOrgasmInstructions.map((m) => toRow(m.windowEndedAt, m, { message: m.message, requiredType: m.requiredType })),
    ...sb.lateLocks.map((a) => toRow(a.fulfilledAt ?? a.deadline, a, { deadline: a.deadline, fulfilledAt: a.fulfilledAt, message: a.message })),
    ...sb.cleaningNotRelocked.map((c) => toRow(c.relockedAt ?? c.deadline, c, { time: c.time, deadline: c.deadline, relockedAt: c.relockedAt, note: c.note })),
  ];
}

/** Liefert das vereinheitlichte Disziplin-Ledger mit Cluster-Kontext bei wrongDevice + inline Notes. */
export async function getOffenses(username: string): Promise<LedgerResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);
  const [sb, deviceClusters] = await Promise.all([
    mcpStrafbuch(username, { iso: true }),
    prisma.device.findMany({ where: { userId }, select: { name: true, lookalikeClusterId: true, securityLevel: true } }),
  ]);
  const rows = buildOffenseRows(sb, new Map(deviceClusters.map((d) => [d.name, d])));

  // Inline-Notes je Offense in EINEM Query.
  const notesByEntity = await notesForEntities(userId, rows.map((r) => ({ entityType: "offense" as const, entityId: r.id })), {}, undefined, timezone);
  for (const r of rows) r.notes = notesByEntity.get(entityKey("offense", r.id)) ?? [];

  return {
    schemaVersion: 2,
    user: username,
    generatedAt: iso(new Date())!,
    timezone,
    detectedOffenseCount: sb.detectedOffenseCount,
    openOffenseCount: sb.openOffenseCount,
    pendingPenaltyCount: sb.pendingPenaltyCount,
    offenses: rows,
  };
}
