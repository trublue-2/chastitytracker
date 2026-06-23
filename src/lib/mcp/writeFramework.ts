import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Prisma-Client innerhalb einer Transaktion (von $transaction an apply/recordAction übergeben). */
export type TxClient = Prisma.TransactionClient;

/**
 * MCP V2 — zentrales Write-Framework. Jeder mutierende V2-Write läuft hier durch, damit die
 * Querschnitts-Regeln EINMAL zentral statt pro Tool gelten:
 *   - Pflicht-`reason` + `source`  → automatisch in KeyholderActionLog (keine stille Mutation)
 *   - server-seitige Validierung   → validate() klemmt/lehnt ab (Guardrails statt Agenten-Gedächtnis)
 *   - Dry-Run / Preview            → Wirkung & Konflikte VOR dem Commit
 *   - Transaktion                  → Mutation + Audit laufen gemeinsam in EINER $transaction
 *                                    (kein Halbzustand, keine Mutation ohne Audit — strukturell erzwungen)
 *   - Diff-Rückgabe                → neuer Zustand + was sich änderte (kein Re-Fetch nötig)
 *
 * KEINE Berechtigungs-Stufen (§10.9 bewusst verworfen): alle Writes sind agent-autonom.
 * Keyholder-Authentifizierung (Admin-OAuth) bleibt im Route-Wrapper (checkMcpKeyholder) —
 * dieses Framework setzt einen bereits autorisierten Kontext voraus.
 *
 * MCP-only, additiv — kein Eingriff in Tracker-Kernlogik. apply() ruft denselben Service-Layer
 * wie die Admin-UI, sodass Verhalten + Notifications identisch bleiben.
 */

export type WriteSource = "agent" | "user-stated";

export interface WriteContext {
  /** Ziel-User der Direktive (MCP_USERNAME). */
  targetUserId: string;
  targetUsername: string;
  /** OAuth-userId des handelnden Keyholders (für den Audit-Actor). */
  actorUserId?: string;
}

/** Verpflichtende Audit-Metadaten an JEDEM V2-Write. */
export interface WriteMeta {
  reason: string;
  source?: WriteSource;
  /** true = nur validieren + preview, NICHT committen. */
  dryRun?: boolean;
}

/** Ergebnis eines committeten Writes: neuer Zustand + Feld-Diff [alt, neu]. */
export interface WriteResult<T> {
  newState: T;
  diff?: Record<string, [unknown, unknown]>;
  /** Betroffene/erzeugte Entity-id für den Action-Log (Goal, Sperrzeit, Note ...). */
  resultRef?: string;
}

/** Tool-Definition: nur Domänen-Logik; das Framework erledigt den Querschnitt. */
export interface WriteDef<A, T> {
  tool: string;
  /** Server-Guardrails: ungültige Werte klemmen oder werfen. Default: identity. */
  validate?: (args: A) => A | Promise<A>;
  /** Dry-Run-Wirkung ohne Commit: effektives Fenster, Konflikte, Vorschau (rein lesend). */
  preview: (ctx: WriteContext, args: A) => Promise<unknown>;
  /** Eigentliche Mutation. Das Framework reicht den Transaktions-Client `tx` herein und schreibt
   *  das Audit im selben `tx` — apply MUSS alle Writes über `tx` führen (nicht über `prisma`),
   *  damit Mutation + Audit atomar sind. Liefert neuen Zustand + Diff. */
  apply: (tx: TxClient, ctx: WriteContext, args: A) => Promise<WriteResult<T>>;
}

export interface DryRunResponse {
  dryRun: true;
  tool: string;
  preview: unknown;
}

export type ExecuteResponse<T> = (WriteResult<T> & { dryRun: false; tool: string }) | DryRunResponse;

/** Berechnet einen flachen Feld-Diff zwischen Vorher- und Nachher-Zustand (nur geänderte Keys).
 *  Vergleich über JSON-Serialisierung — robust für die flachen Skalar-Zustände, die hier gedifft werden. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: T): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) diff[key] = [before[key], after[key]];
  }
  return diff;
}

/** Schreibt einen Audit-Eintrag im übergebenen Transaktions-Client. Append-only;
 *  deckt §9.2 (Action-Log) + §6 (Goal-Audit). */
export async function recordAction(tx: TxClient, params: {
  ctx: WriteContext;
  tool: string;
  reason: string;
  source: WriteSource;
  args: unknown;
  resultRef?: string;
}): Promise<void> {
  await tx.keyholderActionLog.create({
    data: {
      userId: params.ctx.targetUserId,
      tool: params.tool,
      actor: params.ctx.actorUserId ?? null,
      reason: params.reason,
      source: params.source,
      argsJson: params.args === undefined ? null : JSON.stringify(params.args),
      resultRef: params.resultRef ?? null,
    },
  });
}

/**
 * Führt einen V2-Write aus: erzwingt reason, validiert, und committet entweder (mit Audit + Diff)
 * oder gibt — bei dryRun — nur die Preview zurück.
 */
export async function executeWrite<A, T>(
  def: WriteDef<A, T>,
  ctx: WriteContext,
  rawArgs: A,
  meta: WriteMeta,
): Promise<ExecuteResponse<T>> {
  const reason = meta.reason?.trim();
  if (!reason) {
    throw new Error(`Write "${def.tool}" requires a non-empty reason (audit is mandatory).`);
  }
  const source: WriteSource = meta.source ?? "agent";

  // 1. Server-Guardrails — ungültige Werte klemmen/ablehnen, bevor irgendetwas passiert.
  const args = def.validate ? await def.validate(rawArgs) : rawArgs;

  // 2. Dry-Run — Wirkung/Konflikte zeigen, NICHT committen (preview ist rein lesend).
  if (meta.dryRun) {
    return { dryRun: true, tool: def.tool, preview: await def.preview(ctx, args) };
  }

  // 3. Commit: Mutation + Audit in EINER Transaktion — keine Mutation ohne Audit, kein Halbzustand.
  const result = await prisma.$transaction(async (tx) => {
    const r = await def.apply(tx, ctx, args);
    await recordAction(tx, { ctx, tool: def.tool, reason, source, args, resultRef: r.resultRef });
    return r;
  });

  return { ...result, dryRun: false, tool: def.tool };
}
