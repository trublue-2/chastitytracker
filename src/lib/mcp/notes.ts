import { prisma } from "@/lib/prisma";
import {
  resolveUserId, toNoteDTO, noteSelect, type NoteDTO, type EntityRef, type EntityType,
} from "@/lib/mcp/common";
import { diffFields, type WriteDef } from "@/lib/mcp/writeFramework";

/** Notes v2 — strukturierte, versionierte Keyholder-Notizen mit typisierter Verknüpfung an
 *  Tracking-Objekte (§9). MCP-only, additiv. Supersession statt Delete; pinned/BOUNDARY/refs. */

export const NOTE_TYPES = ["DIRECTIVE", "BOUNDARY", "OBSERVATION", "CORRECTION", "EQUIPMENT", "DATA", "HISTORY"] as const;
export const NOTE_STATUS = ["active", "superseded", "archived"] as const;
export const NOTE_SOURCE = ["user-stated", "inferred"] as const;
export const NOTE_CONFIDENCE = ["low", "medium", "high"] as const;
export const ENTITY_TYPES = ["device", "session", "segment", "control", "offense", "orgasmDirective", "goal", "appointment"] as const;

/** Parst einen ISO-String zu einem Date; wirft bei ungültigem Wert (Guardrail). */
function parseDate(value: string | undefined, field: string): Date | undefined {
  if (value == null) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO date for ${field}: "${value}"`);
  return d;
}

// ── Read: query_notes ──────────────────────────────────────────────────────

export interface QueryNotesOptions {
  type?: string;
  status?: string;
  pinned?: boolean;
  kg?: string;
  /** Filter auf Notes, die an ein bestimmtes Objekt hängen. */
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export interface NotesResult {
  schemaVersion: 2;
  user: string;
  notes: NoteDTO[];
}

/** Liefert Notes gefiltert nach type/status/pinned/kg/Objekt. Default: nur aktive, neueste zuerst,
 *  gepinnte oben. Throws, wenn der User unbekannt ist. */
export async function queryNotes(username: string, opts: QueryNotesOptions = {}): Promise<NotesResult> {
  const userId = await resolveUserId(username);
  const refFilter = opts.entityType
    ? { refs: { some: { entityType: opts.entityType, ...(opts.entityId ? { entityId: opts.entityId } : {}) } } }
    : {};
  const notes = await prisma.keyholderNote.findMany({
    where: {
      userId,
      ...(opts.type ? { type: opts.type } : {}),
      // Default: nur aktive Notes; "all" hebt den Filter auf.
      ...(opts.status === "all" ? {} : { status: opts.status ?? "active" }),
      ...(opts.pinned != null ? { pinned: opts.pinned } : {}),
      ...(opts.kg ? { kg: opts.kg } : {}),
      ...refFilter,
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(1, opts.limit ?? 50), 200),
    select: noteSelect,
  });
  return { schemaVersion: 2, user: username, notes: notes.map(toNoteDTO) };
}

// ── Write: upsert_note ──────────────────────────────────────────────────────

export interface UpsertNoteArgs {
  /** Vorhandene Note bearbeiten; weglassen = neue anlegen. */
  id?: string;
  type?: string;
  text?: string;
  kg?: string;
  kategorie?: string;
  pinned?: boolean;
  source?: string;
  confidence?: string;
  status?: string;
  validFrom?: string;
  validUntil?: string;
  doDont?: { do?: string[]; dont?: string[] };
  /** Vorgänger-Note, die durch diese abgelöst wird (alte → status=superseded). Nur beim Anlegen. */
  supersedesId?: string;
  /** Objekte, an die die neue Note gehängt wird (nur beim Anlegen). */
  refs?: EntityRef[];
}

function assertEnum(value: string | undefined, allowed: readonly string[], field: string): void {
  if (value != null && !allowed.includes(value)) {
    throw new Error(`Invalid ${field}: "${value}". Allowed: ${allowed.join(", ")}.`);
  }
}

/** Server-Guardrails für Note-Writes. */
function validateUpsert(args: UpsertNoteArgs): UpsertNoteArgs {
  assertEnum(args.type, NOTE_TYPES, "type");
  assertEnum(args.status, NOTE_STATUS, "status");
  assertEnum(args.source, NOTE_SOURCE, "source");
  assertEnum(args.confidence, NOTE_CONFIDENCE, "confidence");
  for (const r of args.refs ?? []) assertEnum(r.entityType, ENTITY_TYPES, "refs.entityType");
  if (!args.id && !args.text?.trim()) throw new Error("A new note requires non-empty text.");
  return args;
}

const doDontJson = (d: UpsertNoteArgs["doDont"]): string | undefined =>
  d ? JSON.stringify({ do: d.do ?? [], dont: d.dont ?? [] }) : undefined;

/** Editierbare Skalar-Felder einer Note für den Feld-Diff (kein refs/Relationen). */
const noteScalarSnapshot = (n: {
  type: string; text: string; kg: string | null; kategorie: string | null; pinned: boolean;
  source: string; confidence: string | null; status: string; validFrom: Date | null; validUntil: Date | null; doDont: string | null;
}) => ({
  type: n.type, text: n.text, kg: n.kg, kategorie: n.kategorie, pinned: n.pinned,
  source: n.source, confidence: n.confidence, status: n.status,
  validFrom: n.validFrom, validUntil: n.validUntil, doDont: n.doDont,
});

export const upsertNoteDef: WriteDef<UpsertNoteArgs, NoteDTO> = {
  tool: "upsert_note",
  validate: validateUpsert,
  async preview(ctx, args) {
    if (args.id) {
      const existing = await prisma.keyholderNote.findFirst({ where: { id: args.id, userId: ctx.targetUserId }, select: noteSelect });
      if (!existing) throw new Error(`Note not found: ${args.id}`);
      return { action: "edit", before: toNoteDTO(existing) };
    }
    return {
      action: "create",
      willSupersede: args.supersedesId ?? null,
      type: args.type ?? "OBSERVATION",
      refs: args.refs ?? [],
    };
  },
  async apply(tx, ctx, args) {
    const validFrom = parseDate(args.validFrom, "validFrom");
    const validUntil = parseDate(args.validUntil, "validUntil");

    // ── Edit bestehender Note ──
    if (args.id) {
      const existing = await tx.keyholderNote.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`Note not found: ${args.id}`);
      const updated = await tx.keyholderNote.update({
        where: { id: args.id },
        data: {
          // Pflichtfelder (non-null) nur bei gesetztem Wert ändern; optionale Felder mit
          // !== undefined, damit sie bewusst auf null geleert werden können.
          ...(args.type != null ? { type: args.type } : {}),
          ...(args.text != null ? { text: args.text } : {}),
          ...(args.kg !== undefined ? { kg: args.kg } : {}),
          ...(args.kategorie !== undefined ? { kategorie: args.kategorie } : {}),
          ...(args.pinned != null ? { pinned: args.pinned } : {}),
          ...(args.source != null ? { source: args.source } : {}),
          ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
          ...(args.status != null ? { status: args.status } : {}),
          ...(validFrom !== undefined ? { validFrom } : {}),
          ...(validUntil !== undefined ? { validUntil } : {}),
          ...(args.doDont !== undefined ? { doDont: doDontJson(args.doDont) ?? null } : {}),
        },
        select: noteSelect,
      });
      return { newState: toNoteDTO(updated), resultRef: updated.id, diff: diffFields(noteScalarSnapshot(existing), noteScalarSnapshot(updated)) };
    }

    // ── Neue Note (optional mit Supersession + refs) ──
    if (args.supersedesId) {
      const prev = await tx.keyholderNote.findFirst({ where: { id: args.supersedesId, userId: ctx.targetUserId } });
      if (!prev) throw new Error(`supersedesId not found: ${args.supersedesId}`);
      await tx.keyholderNote.update({ where: { id: args.supersedesId }, data: { status: "superseded" } });
    }
    const created = await tx.keyholderNote.create({
      data: {
        userId: ctx.targetUserId,
        type: args.type ?? "OBSERVATION",
        text: args.text!,
        kg: args.kg ?? null,
        kategorie: args.kategorie ?? null,
        pinned: args.pinned ?? false,
        source: args.source ?? "inferred",
        confidence: args.confidence ?? null,
        status: args.status ?? "active",
        validFrom: validFrom ?? null,
        validUntil: validUntil ?? null,
        doDont: doDontJson(args.doDont) ?? null,
        supersedesId: args.supersedesId ?? null,
        refs: args.refs?.length ? { create: args.refs.map((r) => ({ entityType: r.entityType, entityId: r.entityId })) } : undefined,
      },
      select: noteSelect,
    });
    return { newState: toNoteDTO(created), resultRef: created.id };
  },
};

// ── Write: link_note ────────────────────────────────────────────────────────

export interface LinkNoteArgs {
  noteId: string;
  refs: EntityRef[];
}

export const linkNoteDef: WriteDef<LinkNoteArgs, NoteDTO> = {
  tool: "link_note",
  validate(args) {
    if (!args.refs?.length) throw new Error("link_note requires at least one ref.");
    for (const r of args.refs) assertEnum(r.entityType, ENTITY_TYPES, "refs.entityType");
    return args;
  },
  async preview(ctx, args) {
    const note = await prisma.keyholderNote.findFirst({ where: { id: args.noteId, userId: ctx.targetUserId }, select: { id: true } });
    if (!note) throw new Error(`Note not found: ${args.noteId}`);
    return { action: "link", noteId: args.noteId, addRefs: args.refs };
  },
  async apply(tx, ctx, args) {
    // Ownership-Check und bestehende Refs sind unabhängig → parallel laden.
    const [note, existing] = await Promise.all([
      tx.keyholderNote.findFirst({ where: { id: args.noteId, userId: ctx.targetUserId }, select: { id: true } }),
      tx.noteRef.findMany({ where: { noteId: args.noteId }, select: { entityType: true, entityId: true } }),
    ]);
    if (!note) throw new Error(`Note not found: ${args.noteId}`);
    // Duplikate überspringen (idempotentes Verlinken).
    const have = new Set(existing.map((r) => `${r.entityType}:${r.entityId}`));
    const fresh = args.refs.filter((r) => !have.has(`${r.entityType}:${r.entityId}`));
    if (fresh.length) {
      await tx.noteRef.createMany({ data: fresh.map((r) => ({ noteId: args.noteId, entityType: r.entityType, entityId: r.entityId })) });
    }
    // newState trägt die aktualisierten refs bereits — kein separates diff-Feld nötig.
    const updated = await tx.keyholderNote.findUniqueOrThrow({ where: { id: args.noteId }, select: noteSelect });
    return { newState: toNoteDTO(updated), resultRef: args.noteId };
  },
};

export type { EntityType };
