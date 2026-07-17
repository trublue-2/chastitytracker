import { prisma } from "@/lib/prisma";
import { resolveUserContext, makeIso, buildEnvelope, parseIsoDate, type Envelope } from "@/lib/mcp/common";

/** get_action_log (§9.2) — append-only Audit aller mutierenden V2-Aktionen: was hat welche Instanz
 *  wann mit welcher Begründung entschieden. Damit erbt die nächste Instanz Entscheidungen samt
 *  Begründung (nicht nur Zustände).
 *
 *  Hinweis zum Goal-Change-Log (§6): die AUTORITATIVE Ziel-Historie liegt in den TrainingVorgaben
 *  selbst (gueltigAb/gueltigBis, via list_training_goals) — auch für UI-/Pre-MCP-gesetzte Ziele.
 *  Dieses Log liefert nur das WARUM/WANN der über den MCP ausgelösten Änderungen (reason + actor),
 *  nicht die vollständige Zustandshistorie. Rein lesend, MCP-only. */

export interface ActionLogRow {
  id: string;
  at: string;
  tool: string;
  actor: string | null;
  reason: string;
  source: string;
  /** Tool-Eingabe als JSON-Wert (geparst), oder null. */
  args: unknown;
  resultRef: string | null;
}

export interface ActionLogResult extends Envelope {
  schemaVersion: 2;
  user: string;
  returnedCount: number;
  actions: ActionLogRow[];
}

export interface ActionLogOptions {
  /** Filter auf ein Tool (z.B. "set_training_goal" für das Goal-Change-Log). */
  tool?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function safeParse(json: string | null): unknown {
  if (json == null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

/** Liefert das Action-Log, neueste zuerst, optional nach Tool/Zeit gefiltert. Throws bei unbekanntem User. */
export async function getActionLog(username: string, opts: ActionLogOptions = {}): Promise<ActionLogResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);
  const now = new Date();
  const from = parseIsoDate(opts.from, "from");
  const to = parseIsoDate(opts.to, "to");
  const rows = await prisma.keyholderActionLog.findMany({
    where: {
      userId,
      ...(opts.tool ? { tool: opts.tool } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, opts.limit ?? 100), 500),
  });
  return {
    schemaVersion: 2,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    returnedCount: rows.length,
    actions: rows.map((r) => ({
      id: r.id, at: iso(r.createdAt)!, tool: r.tool, actor: r.actor, reason: r.reason,
      source: r.source, args: safeParse(r.argsJson), resultRef: r.resultRef,
    })),
  };
}
