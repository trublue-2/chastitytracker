import { prisma } from "@/lib/prisma";
import {
  resolveUserContext, makeIso, buildEnvelope, tzOf, toNoteDTO, noteSelect, parseIsoDate, entityKey, matchByNameCI,
  type Envelope, type NoteDTO, type EntityRef, type EntityType,
} from "@/lib/mcp/common";
import { assertVersionRequiresId, diffFields, occEdit, type TxClient, type WriteDef } from "@/lib/mcp/writeFramework";

/** Notes v2 — strukturierte, versionierte Keyholder-Notizen mit typisierter Verknüpfung an
 *  Tracking-Objekte (explain_model §13). MCP-only, additiv. Supersession statt Delete;
 *  pinned/BOUNDARY/refs. */

export const NOTE_TYPES = ["DIRECTIVE", "BOUNDARY", "OBSERVATION", "CORRECTION", "EQUIPMENT", "DATA", "HISTORY"] as const;
export const NOTE_STATUS = ["active", "superseded", "archived"] as const;
export const NOTE_SOURCE = ["user-stated", "inferred"] as const;
export const NOTE_CONFIDENCE = ["low", "medium", "high"] as const;
export const ENTITY_TYPES = ["device", "session", "segment", "control", "offense", "orgasmDirective", "goal", "appointment"] as const;

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

export interface NotesResult extends Envelope {
  schemaVersion: 2;
  user: string;
  returnedCount: number;
  /** true, wenn ein konkretes `entityType`+`entityId` abgefragt wurde, dieses Objekt aber nicht (mehr)
   *  existiert — dann heisst `notes: []` „kein solches Objekt", nicht „Objekt ohne Notizen". Sonst
   *  false (K-13, MCP-Restliste 2026-07-17: der Read schluckte unbekannte IDs vorher still). */
  unknownRef: boolean;
  notes: NoteDTO[];
}

/** Liefert Notes gefiltert nach type/status/pinned/kg/Objekt. Default: nur aktive, neueste zuerst,
 *  gepinnte oben. Throws, wenn der User unbekannt ist. */
export async function queryNotes(username: string, opts: QueryNotesOptions = {}): Promise<NotesResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);
  const now = new Date();
  const refFilter = opts.entityType
    ? { refs: { some: { entityType: opts.entityType, ...(opts.entityId ? { entityId: opts.entityId } : {}) } } }
    : {};
  // K-13: prüfen, ob ein konkret abgefragtes Objekt überhaupt existiert (dieselbe REF_EXISTS-Karte
  // wie der Write-Guard). `offense` fehlt dort bewusst (polymorphe refId) → nicht prüfbar, kein Flag.
  const refCheck = opts.entityType && opts.entityId ? REF_EXISTS[opts.entityType as EntityType] : undefined;
  const unknownRef = refCheck ? !(await refCheck(prisma, userId, opts.entityId!)) : false;
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
  return { schemaVersion: 2, user: username, ...buildEnvelope(now, iso, timezone), returnedCount: notes.length, unknownRef, notes: notes.map((n) => toNoteDTO(n, iso)) };
}

// ── Write: upsert_note ──────────────────────────────────────────────────────

export interface UpsertNoteArgs {
  /** Vorhandene Note bearbeiten; weglassen = neue anlegen. */
  id?: string;
  /** OCC-Token — siehe occEdit (writeFramework). */
  expectedVersion?: number;
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

/** Existenz-Lookup je Entity-Typ (userId-gescoped). `session`/`segment`-ids sind Entry-ids.
 *  `offense` fehlt bewusst: seine refId ist polymorph (je nach Vergehens-Typ eine Entry-,
 *  Kontroll- oder Direktiven-id) — dafür gibt es keine eine Tabelle zum Prüfen. */
const entryExists = async (tx: TxClient, userId: string, id: string) => !!(await tx.entry.findFirst({ where: { id, userId }, select: { id: true } }));
const REF_EXISTS: Partial<Record<EntityType, (tx: TxClient, userId: string, id: string) => Promise<boolean>>> = {
  // `device` prüft bewusst NICHT archivedAt: ein archiviertes Gerät bleibt ein gültiges Ref-Ziel
  // (Notizen zu einem Gerät sollen die Historie überleben, nicht mit dem Archivieren unauffindbar
  // werden). `goal` spiegelt dieselbe Regel für soft-gelöschte Trainingsziele (B-04, MCP-Befundliste
  // 2026-07-17, bewusst KEIN deletedAt-Filter) — anders als jede Existenzprüfung, die ein Ziel aktiv
  // BEARBEITEN will (findActiveVorgabe), darf ein reiner Historien-Ref auf ein gelöschtes Ziel zeigen.
  device: async (tx, userId, id) => !!(await tx.device.findFirst({ where: { id, userId }, select: { id: true } })),
  session: entryExists,
  segment: entryExists,
  control: async (tx, userId, id) => !!(await tx.kontrollAnforderung.findFirst({ where: { id, userId }, select: { id: true } })),
  orgasmDirective: async (tx, userId, id) => !!(await tx.orgasmusAnforderung.findFirst({ where: { id, userId }, select: { id: true } })),
  goal: async (tx, userId, id) => !!(await tx.trainingVorgabe.findFirst({ where: { id, userId }, select: { id: true } })),
  appointment: async (tx, userId, id) => !!(await tx.appointment.findFirst({ where: { id, userId }, select: { id: true } })),
};

/** Weist Refs auf nicht (mehr) existierende Objekte ab, statt still einen Dangling-Ref anzulegen
 *  (Geräte ohne Einträge werden hart gelöscht — ein Ref darauf wäre dauerhaft tot). */
async function assertRefsExist(tx: TxClient, userId: string, refs: EntityRef[]): Promise<void> {
  const results = await Promise.all(refs.map(async (r) => {
    const exists = REF_EXISTS[r.entityType];
    return exists ? { r, ok: await exists(tx, userId, r.entityId) } : { r, ok: true };
  }));
  const missing = results.filter((x) => !x.ok);
  if (missing.length) {
    throw new Error(`refs point to unknown objects: ${missing.map((x) => entityKey(x.r.entityType, x.r.entityId)).join(", ")}.`);
  }
}

/** Löst den kg-Freitext-Tag (Gerätename) in einen Device-Ref auf — case-insensitiv. Kein Treffer
 *  ist KEIN Fehler: kg darf auch Nicht-Inventar-Geräte benennen. (Bewusst nicht resolveDevice aus
 *  devices.ts: das wirft bei Miss und listet Namen — hier ist Miss ein legitimer Zustand.) */
async function kgDeviceRef(tx: TxClient, userId: string, kg: string | undefined): Promise<EntityRef | null> {
  if (!kg?.trim()) return null;
  const devices = await tx.device.findMany({ where: { userId }, select: { id: true, name: true } });
  const match = matchByNameCI(devices, kg);
  return match ? { entityType: "device", entityId: match.id } : null;
}

/** true, wenn der (kg-)Device-Ref in `refs` noch fehlt — Dedup-Guard für create + edit. */
const missingRef = (refs: readonly { entityType: string; entityId: string }[], ref: EntityRef): boolean =>
  !refs.some((r) => r.entityType === ref.entityType && r.entityId === ref.entityId);

/** Nur DIRECTIVE/BOUNDARY werden gepinnt auf dem Dashboard ausgespielt (dashboard.ts →
 *  standingDirectives/boundaries). `pinned:true` auf einem anderen Typ setzt ein Flag, das nichts
 *  liest — früher still ignoriert, jetzt abgewiesen, damit die Instanz nicht glaubt, eine Notiz
 *  angepinnt zu haben, die nirgends erscheint. */
const PIN_SURFACING_TYPES: readonly string[] = ["DIRECTIVE", "BOUNDARY"];
function assertPinnable(pinned: boolean | undefined, type: string): void {
  if (pinned === true && !PIN_SURFACING_TYPES.includes(type)) {
    throw new Error(
      `pinned:true only affects ${PIN_SURFACING_TYPES.join("/")} notes (only those surface on the dashboard); ` +
      `type "${type}" cannot be pinned.`,
    );
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
  // Nur der Create (Default-Typ OBSERVATION, kein DB-Fetch) wird hier geprüft. Jeder Edit läuft
  // danach durch genau EINEN von preview/apply — beide prüfen dort gegen `args.type ?? existing.type`.
  if (!args.id) assertPinnable(args.pinned, args.type ?? "OBSERVATION");
  assertVersionRequiresId(args);
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

/** Feld-Merge eines Note-Edits (Pflichtfelder non-null nur bei Wert, optionale via !== undefined,
 *  damit sie bewusst auf null geleert werden können). Geteilt von preview (after) und apply (DB-
 *  Update), damit die Vorschau denselben Diff zeigt wie der Commit (N-15). */
const noteEditData = (args: UpsertNoteArgs, validFrom: Date | undefined, validUntil: Date | undefined) => ({
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
});

export const upsertNoteDef: WriteDef<UpsertNoteArgs, NoteDTO> = {
  tool: "upsert_note",
  validate: validateUpsert,
  async preview(ctx, args) {
    if (args.id) {
      const [existing, tz] = await Promise.all([
        prisma.keyholderNote.findFirst({ where: { id: args.id, userId: ctx.targetUserId }, select: noteSelect }),
        tzOf(ctx.targetUserId),
      ]);
      if (!existing) throw new Error(`Note not found: ${args.id}`);
      // Effektiv-Stand nach dem Edit prüfen: auch ein Typ-Wechsel einer BEREITS gepinnten
      // DIRECTIVE/BOUNDARY auf einen Nicht-Ausspiel-Typ (ohne `pinned` anzufassen) darf keinen
      // verwaisten Pin hinterlassen.
      assertPinnable(args.pinned ?? existing.pinned, args.type ?? existing.type);
      // Check-only: Versions-Konflikt schon im dryRun sichtbar machen.
      occEdit(args.expectedVersion, existing.version, `note ${args.id}`);
      // Preview-Treue: den kg→Device-Ref zeigen, den der Commit anlegen würde.
      const kgRef = await kgDeviceRef(prisma, ctx.targetUserId, args.kg);
      const willAddRef = kgRef && missingRef(existing.refs, kgRef) ? kgRef : null;
      const before = noteScalarSnapshot(existing);
      const after = noteScalarSnapshot({ ...existing, ...noteEditData(args, parseIsoDate(args.validFrom, "validFrom"), parseIsoDate(args.validUntil, "validUntil")) });
      return { preview: { action: "edit", before: toNoteDTO(existing, makeIso(tz)), willAddRef }, before, after };
    }
    // Dangling-Refs schon im dryRun abweisen (Konflikte VOR dem Commit); kg→Device-Ref mitzeigen.
    await assertRefsExist(prisma, ctx.targetUserId, args.refs ?? []);
    const refs = [...(args.refs ?? [])];
    const kgRef = await kgDeviceRef(prisma, ctx.targetUserId, args.kg);
    if (kgRef && missingRef(refs, kgRef)) refs.push(kgRef);
    return {
      preview: {
        action: "create",
        willSupersede: args.supersedesId ?? null,
        type: args.type ?? "OBSERVATION",
        refs,
      },
    };
  },
  async apply(tx, ctx, args) {
    const validFrom = parseIsoDate(args.validFrom, "validFrom");
    const validUntil = parseIsoDate(args.validUntil, "validUntil");
    const iso = makeIso(await tzOf(ctx.targetUserId, tx));

    // ── Edit bestehender Note ──
    if (args.id) {
      const existing = await tx.keyholderNote.findFirst({ where: { id: args.id, userId: ctx.targetUserId }, select: noteSelect });
      if (!existing) throw new Error(`Note not found: ${args.id}`);
      // Effektiv-Stand nach dem Edit prüfen: auch ein Typ-Wechsel einer BEREITS gepinnten
      // DIRECTIVE/BOUNDARY auf einen Nicht-Ausspiel-Typ (ohne `pinned` anzufassen) darf keinen
      // verwaisten Pin hinterlassen.
      assertPinnable(args.pinned ?? existing.pinned, args.type ?? existing.type);
      const bump = occEdit(args.expectedVersion, existing.version, `note ${args.id}`);
      // kg-Tag → Device-Ref nachziehen (VOR dem Update, damit das Select den Ref schon trägt):
      // eine Note mit kg="<Gerätename>" ohne Ref wäre über get_devices unauffindbar.
      const kgRef = await kgDeviceRef(tx, ctx.targetUserId, args.kg);
      if (kgRef && missingRef(existing.refs, kgRef)) {
        await tx.noteRef.create({ data: { noteId: args.id, entityType: kgRef.entityType, entityId: kgRef.entityId } });
      }
      const data = noteEditData(args, validFrom, validUntil);
      // No-op-Edit (keine Felder angegeben): nicht schreiben und v.a. die Version NICHT bumpen —
      // ein Bump würde die expectedVersion aller anderen Leser grundlos invalidieren.
      const updated = Object.keys(data).length
        ? await tx.keyholderNote.update({ where: { id: args.id }, data: { ...bump, ...data }, select: noteSelect })
        : existing;
      return { newState: toNoteDTO(updated, iso), resultRef: updated.id, diff: diffFields(noteScalarSnapshot(existing), noteScalarSnapshot(updated)) };
    }

    // ── Neue Note (optional mit Supersession + refs) ──
    if (args.supersedesId) {
      const prev = await tx.keyholderNote.findFirst({ where: { id: args.supersedesId, userId: ctx.targetUserId } });
      if (!prev) throw new Error(`supersedesId not found: ${args.supersedesId}`);
      // Status-Wechsel ist ein Edit der alten Note — Version bumpen, damit fremde expectedVersion
      // die Supersession als Konflikt erkennen (sonst editiert jemand eine abgelöste Note "erfolgreich").
      await tx.keyholderNote.update({ where: { id: args.supersedesId }, data: { status: "superseded", version: { increment: 1 } } });
    }
    // Refs auf Existenz prüfen (kein stiller Dangling-Ref) + kg-Tag als Device-Ref mitverdrahten.
    const refs = [...(args.refs ?? [])];
    await assertRefsExist(tx, ctx.targetUserId, refs);
    const kgRef = await kgDeviceRef(tx, ctx.targetUserId, args.kg);
    if (kgRef && missingRef(refs, kgRef)) refs.push(kgRef);
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
        refs: refs.length ? { create: refs.map((r) => ({ entityType: r.entityType, entityId: r.entityId })) } : undefined,
      },
      select: noteSelect,
    });
    return { newState: toNoteDTO(created, iso), resultRef: created.id };
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
    // Dangling-Refs schon im dryRun abweisen (Konflikte VOR dem Commit).
    await assertRefsExist(prisma, ctx.targetUserId, args.refs);
    return { preview: { action: "link", noteId: args.noteId, addRefs: args.refs } };
  },
  async apply(tx, ctx, args) {
    // Ownership-Check und bestehende Refs sind unabhängig → parallel laden.
    const [note, existing] = await Promise.all([
      tx.keyholderNote.findFirst({ where: { id: args.noteId, userId: ctx.targetUserId }, select: { id: true } }),
      tx.noteRef.findMany({ where: { noteId: args.noteId }, select: { entityType: true, entityId: true } }),
    ]);
    if (!note) throw new Error(`Note not found: ${args.noteId}`);
    // Duplikate überspringen (idempotentes Verlinken); neue Refs müssen auf existierende Objekte zeigen.
    const have = new Set(existing.map((r) => `${r.entityType}:${r.entityId}`));
    const fresh = args.refs.filter((r) => !have.has(`${r.entityType}:${r.entityId}`));
    await assertRefsExist(tx, ctx.targetUserId, fresh);
    if (fresh.length) {
      await tx.noteRef.createMany({ data: fresh.map((r) => ({ noteId: args.noteId, entityType: r.entityType, entityId: r.entityId })) });
      // refs sind Teil des Note-DTO — der Bump macht die Änderung für expectedVersion-Inhaber sichtbar.
      await tx.keyholderNote.update({ where: { id: args.noteId }, data: { version: { increment: 1 } } });
    }
    // newState trägt die aktualisierten refs bereits — kein separates diff-Feld nötig.
    const [updated, tz] = await Promise.all([
      tx.keyholderNote.findUniqueOrThrow({ where: { id: args.noteId }, select: noteSelect }),
      tzOf(ctx.targetUserId, tx),
    ]);
    return { newState: toNoteDTO(updated, makeIso(tz)), resultRef: args.noteId };
  },
};

export type { EntityType };
