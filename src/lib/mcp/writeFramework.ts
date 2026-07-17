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

/**
 * Ergebnis eines dryRun-`preview()`: die menschenlesbare Vorschau plus — bei Edits — die skalaren
 * `before`/`after`-Schnappschüsse, aus denen das Framework den `diff` rechnet (N-15, MCP-Restliste
 * 2026-07-17: der V2-dryRun lieferte vorher nur `before`, während explain_model „Diff + neuen
 * Zustand" versprach). Reine Creates lassen `before`/`after` weg (kein Diff). `problem` (falls
 * gesetzt) macht `wouldSucceed:false` — analog zu den V1-Tools; unerfüllbare Vorbedingungen (Objekt
 * nicht gefunden, Versions-Konflikt) werfen weiterhin.
 */
export interface PreviewResult {
  preview: unknown;
  /** `before`/`after` sind die skalaren Projektions-Schnappschüsse (Basis für `diffFields`), in
   *  DERSELBEN Form zueinander — NICHT zwingend die Form des committeten `newState` (das ein reicheres
   *  DTO ist). `after` bildet den Vor-Commit-Stand ab: eine OCC-`version` darin ist noch die Basis-
   *  Version, nicht die nach dem Commit inkrementierte. Der `diff` (version-frei) ist massgeblich. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  problem?: string;
}

/** Tool-Definition: nur Domänen-Logik; das Framework erledigt den Querschnitt. */
export interface WriteDef<A, T> {
  tool: string;
  /** Server-Guardrails: ungültige Werte klemmen oder werfen. Default: identity. */
  validate?: (args: A) => A | Promise<A>;
  /** Dry-Run-Wirkung ohne Commit: Vorschau + (bei Edits) before/after für den Diff. Rein lesend. */
  preview: (ctx: WriteContext, args: A) => Promise<PreviewResult>;
  /** Eigentliche Mutation. Das Framework reicht den Transaktions-Client `tx` herein und schreibt
   *  das Audit im selben `tx` — apply MUSS alle Writes über `tx` führen (nicht über `prisma`),
   *  damit Mutation + Audit atomar sind. Liefert neuen Zustand + Diff. */
  apply: (tx: TxClient, ctx: WriteContext, args: A) => Promise<WriteResult<T>>;
}

export interface DryRunResponse {
  dryRun: true;
  tool: string;
  /** false, wenn `preview` ein `problem` meldete (unerfüllbare reine Regel). Sonst true. */
  wouldSucceed: boolean;
  problem?: string;
  preview: unknown;
  /** Feld-Diff [alt, neu] — nur bei Edits mit before/after (wie beim echten Commit). */
  diff?: Record<string, [unknown, unknown]>;
  /** Projizierter Nachher-Zustand (skalar) — nur bei Edits. */
  after?: unknown;
}

export type ExecuteResponse<T> = (WriteResult<T> & { dryRun: false; tool: string }) | DryRunResponse;

/** Berechnet einen flachen Feld-Diff zwischen Vorher- und Nachher-Zustand (nur geänderte Keys).
 *  Vergleich über JSON-Serialisierung — robust für die flachen Skalar-Zustände, die hier gedifft werden.
 *  `version` (OCC-Buchhaltung, s.u.) wird nicht gedifft — der Increment ist impliziter Teil jedes Edits;
 *  die neue Version steht im newState. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: T): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "version") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) diff[key] = [before[key], after[key]];
  }
  return diff;
}

/**
 * Optimistic Concurrency für Edit-Writes: Objekte mit `version`-Spalte (Note, Device, Appointment,
 * RecurringContext) werden bei jedem Edit inkrementiert. Gibt der Aufrufer `expectedVersion` mit
 * und die Zeile wurde zwischenzeitlich von einem anderen Schreiber (zweite Keyholder-Instanz,
 * Admin-UI) geändert, lehnt der Write ab statt still zu überschreiben. Ohne `expectedVersion`
 * bleibt das Verhalten der blinde Last-Write-Wins von früher (abwärtskompatibel).
 *
 * `occEdit` koppelt Check und Increment untrennbar: es wirft bei Versions-Abweichung und liefert
 * sonst den `version`-Increment als Data-Spread für das Update — ein Edit kann den Check nicht
 * ohne den Bump bekommen (und umgekehrt). Der Check läuft INNERHALB der Framework-$transaction
 * auf der frisch per `tx` gelesenen Zeile — SQLite serialisiert Writes über die eine Verbindung,
 * damit ist Read-Check-Write hier race-frei.
 */
export function occEdit(expected: number | undefined, current: number, what: string): { version: { increment: 1 } } {
  if (expected !== undefined && expected !== current) {
    throw new Error(
      `Version conflict on ${what}: expectedVersion ${expected}, but current version is ${current} — ` +
      `the object was modified by another writer. Re-read it and retry with version ${current}.`,
    );
  }
  return { version: { increment: 1 } };
}

/** Validate-Hälfte der OCC: `expectedVersion` ist ein Edit-Token — beim Anlegen gibt es noch keine
 *  Zeile, deren Version man erwarten könnte. */
export function assertVersionRequiresId(args: { id?: string; expectedVersion?: number }): void {
  if (!args.id && args.expectedVersion !== undefined) {
    throw new Error("expectedVersion only applies to edits (requires `id`).");
  }
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

  // 2. Dry-Run — Wirkung/Konflikte zeigen, NICHT committen (preview ist rein lesend). Liefert
  //    dieselbe Form wie die V1-Tools: {wouldSucceed, problem?, preview, diff?, after?} (N-15).
  if (meta.dryRun) {
    const p = await def.preview(ctx, args);
    const diff = p.before && p.after ? diffFields(p.before, p.after) : undefined;
    return {
      dryRun: true,
      tool: def.tool,
      wouldSucceed: !p.problem,
      ...(p.problem ? { problem: p.problem } : {}),
      preview: p.preview,
      ...(diff ? { diff } : {}),
      ...(p.after ? { after: p.after } : {}),
    };
  }

  // 3. Commit: Mutation + Audit in EINER Transaktion — keine Mutation ohne Audit, kein Halbzustand.
  const result = await prisma.$transaction(async (tx) => {
    const r = await def.apply(tx, ctx, args);
    await recordAction(tx, { ctx, tool: def.tool, reason, source, args, resultRef: r.resultRef });
    return r;
  });

  return { ...result, dryRun: false, tool: def.tool };
}
