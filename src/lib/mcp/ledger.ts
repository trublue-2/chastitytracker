import { prisma } from "@/lib/prisma";
import { mcpStrafbuch, type OffenseJudgment } from "@/lib/mcpOverview";
import { resolveUserId, notesForEntities, entityKey, type NoteDTO } from "@/lib/mcp/common";

/** Disziplin-Ledger (§4) — vereinheitlicht die getrennten Strafbuch-Kategorien zu EINER
 *  Offense-Liste mit durchgängiger Taxonomie, open-vs-judged, Auslöser und Folge. Reines
 *  MCP-Post-Processing über mcpStrafbuch — KEIN Eingriff in buildStrafbuch (Tracker-Core).
 *
 *  Cluster-Softening (§3.1/§5.3): das erwartete Gerät eines wrongDevice-Vergehens liegt nicht im
 *  Strafbuch-Output und liesse sich nur über Detection-Logik im Core rekonstruieren. Daher hängen
 *  wir den Cluster/securityLevel des GETRAGENEN Geräts als Kontext an (`deviceCluster`) und
 *  markieren `possiblyClusterInternal`, statt automatisch zu verwerfen — die Entscheidung trifft
 *  der Keyholder via judge_offense. */

/** Kanonische Offense-Taxonomie (entspricht den ref.type-Werten aus mcpStrafbuch). */
export const OFFENSE_TYPES = [
  "unauthorized_opening", "late_control", "rejected_control",
  "cleaning_limit", "wrong_device", "missed_orgasm",
] as const;

export interface OffenseRow {
  id: string;
  type: string;
  /** HINWEIS: detectedAt/judgedAt und die Zeiten in `context` stammen aus mcpStrafbuch und sind im
   *  Instanz-lokalen Human-Format ("dd.mm.yyyy, HH:mm"), NICHT ISO-8601 (Naht der V1-Komposition). */
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

/** Liefert das vereinheitlichte Disziplin-Ledger mit Cluster-Kontext bei wrongDevice + inline Notes. */
export async function getOffenses(username: string): Promise<LedgerResult> {
  const userId = await resolveUserId(username);
  const [sb, deviceClusters] = await Promise.all([
    mcpStrafbuch(username),
    prisma.device.findMany({ where: { userId }, select: { name: true, lookalikeClusterId: true, securityLevel: true } }),
  ]);
  const clusterByName = new Map(deviceClusters.map((d) => [d.name, d]));

  const rows: OffenseRow[] = [
    ...sb.unauthorizedOpenings.map((o) => toRow(o.time, o, { note: o.note, lockPeriodEndedAt: o.lockPeriodEndedAt, lockPeriodIndefinite: o.lockPeriodIndefinite })),
    ...sb.lateControls.map((c) => toRow(c.entryTime ?? c.deadline, c, { code: c.code, deadline: c.deadline, fulfilledAt: c.fulfilledAt, backdated: c.backdated, comment: c.comment })),
    ...sb.rejectedControls.map((c) => toRow(c.entryTime ?? c.deadline, c, { code: c.code, deadline: c.deadline, fulfilledAt: c.fulfilledAt, comment: c.comment })),
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
  ];

  // Inline-Notes je Offense in EINEM Query.
  const notesByEntity = await notesForEntities(userId, rows.map((r) => ({ entityType: "offense" as const, entityId: r.id })));
  for (const r of rows) r.notes = notesByEntity.get(entityKey("offense", r.id)) ?? [];

  return {
    schemaVersion: 2,
    user: username,
    detectedOffenseCount: sb.detectedOffenseCount,
    openOffenseCount: sb.openOffenseCount,
    pendingPenaltyCount: sb.pendingPenaltyCount,
    offenses: rows,
  };
}
