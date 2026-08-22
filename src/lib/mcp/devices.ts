import { prisma } from "@/lib/prisma";
import { resolveUserContext, makeIso, buildEnvelope, notesForEntities, entityKey, matchByNameCI, parseStringArray, tzOf, type Iso, type NoteDTO, type Envelope } from "@/lib/mcp/common";
import { assertVersionRequiresId, diffFields, occEdit, type WriteDef, type TxClient } from "@/lib/mcp/writeFramework";
import { listCategoryViews, type CategoryView } from "@/lib/mcp/categories";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { applyDeviceRemoval, planDeviceRemoval } from "@/lib/deviceService";
import {
  DEVICE_DESCRIPTION_MAX_LENGTH, DEVICE_NAME_MAX_LENGTH, VALID_CURRENCIES, validateDeviceInput,
  type DeviceValidationCode,
} from "@/lib/constants";

/** Geräte-Metadaten, die Keyholder-Entscheidungen tragen (explain_model §13) + angereicherte
 *  Geräteliste mit Inline-Notes. MCP-only, additiv. */

export const SECURITY_LEVELS = ["SECURING", "TRUST_ONLY"] as const;

export interface DeviceMetaView {
  id: string;
  name: string;
  category: string;
  /** Die Kategorie-id — die Zuordnung setzt `upsert_device`; die Liste steht in `categories`. */
  categoryId: string | null;
  isKg: boolean;
  /** false = Inventory-only-Kategorie (z.B. Halsband/Knebel): liefert PER DESIGN keine Trage-
   *  Sessions und fehlt darum in device_stats — Abwesenheit dort ist keine Nichtnutzung. */
  trackingEnabled: boolean;
  archived: boolean;
  description: string | null;
  purchasePrice: number | null;
  currency: string | null;
  /** Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto? */
  requireInspectionCode: boolean;
  securityLevel: string | null;
  lookalikeClusterId: string | null;
  /** true = lässt sich trotz Verschluss abstreifen (unsicher), false = sitzt sicher, `null` = NIE
   *  beurteilt (K-08, MCP-Restliste 2026-07-17: früher `false`-Default, das „nicht beurteilt" als
   *  „sicher" verkaufte — z.B. bei Halsband/Knebel). `false` heisst jetzt „geprüft und sicher". */
  pullOffRisk: boolean | null;
  material: string | null;
  bauform: string | null;
  healthFlags: string[];
  retentionNotes: string | null;
  referenceImages: number;
  createdAt: string;
  /** Optimistic-Concurrency-Token — bei set_device_meta als `expectedVersion` mitgeben (siehe writeFramework). */
  version: number;
  notes: NoteDTO[];
}

export interface DeviceListResult extends Envelope {
  /** v5: `category` ist nicht mehr die einzige Sicht auf die Kategorie — neu `categoryId` am Gerät
   *  und die vollständige Liste `categories` (ohne deren ids liesse sich kein Gerät zuordnen), dazu
   *  `requireInspectionCode`. Rein additiv, aber die Werkzeuge daneben sind neu: Inventar schreiben
   *  via `upsert_device`/`delete_device`, Kategorien via `upsert_category`/`delete_category` → Bump.
   *  v4: `pullOffRisk` ist jetzt nullable — `null` = nie beurteilt, `false` = geprüft und sicher
   *  (K-08, MCP-Restliste 2026-07-17: die Bedeutung von `false` hat sich verengt → Bump). Neu setzbar:
   *  `archived` via set_device_meta; get_devices blendet Archivierte per Default aus (`includeArchived`).
   *  v3: `abstreifbar` → `pullOffRisk`; neu `version`, `trackingEnabled`. */
  schemaVersion: 5;
  user: string;
  returnedCount: number;
  devices: DeviceMetaView[];
  /** ALLE Kategorien des Subs (KG zuerst) — unabhängig von den Filtern auf der Geräteliste. */
  categories: CategoryView[];
}

/** Lese-Filter für get_devices (alle optional). `includeNotes` default true, `includeArchived`
 *  default false (K-09/K-10, MCP-Restliste 2026-07-17). */
export interface ListDevicesOptions {
  includeNotes?: boolean;
  includeArchived?: boolean;
  deviceId?: string;
}

/** Vollständiger Select für die angereicherte Geräte-Ansicht (von Liste + Single-Re-Fetch geteilt). */
const deviceViewSelect = {
  id: true, name: true, description: true, archivedAt: true, createdAt: true,
  purchasePrice: true, currency: true, categoryId: true, requireInspectionCode: true,
  securityLevel: true, lookalikeClusterId: true, pullOffRisk: true,
  material: true, bauform: true, healthFlags: true, retentionNotes: true, version: true,
  category: { select: { name: true, isBuiltIn: true, trackingEnabled: true } },
  _count: { select: { referenceImages: true } },
} as const;

type DeviceViewRow = {
  id: string; name: string; description: string | null; archivedAt: Date | null; createdAt: Date;
  purchasePrice: number | null; currency: string | null; categoryId: string | null; requireInspectionCode: boolean;
  securityLevel: string | null; lookalikeClusterId: string | null; pullOffRisk: boolean | null;
  material: string | null; bauform: string | null; healthFlags: string | null; retentionNotes: string | null;
  version: number;
  category: { name: string; isBuiltIn: boolean; trackingEnabled: boolean } | null;
  _count: { referenceImages: number };
};

/** Mappt eine Geräte-Zeile (+ inline Notes) auf das stabile MCP-DTO. Eine Quelle für Liste + Write. */
function toDeviceMetaView(d: DeviceViewRow, notes: NoteDTO[], iso: Iso): DeviceMetaView {
  return {
    id: d.id,
    name: d.name,
    category: d.category?.name ?? "—",
    categoryId: d.categoryId,
    isKg: d.category?.isBuiltIn ?? false,
    trackingEnabled: d.category?.trackingEnabled ?? true,
    archived: d.archivedAt !== null,
    description: d.description,
    purchasePrice: d.purchasePrice,
    currency: d.currency,
    requireInspectionCode: d.requireInspectionCode,
    securityLevel: d.securityLevel,
    lookalikeClusterId: d.lookalikeClusterId,
    pullOffRisk: d.pullOffRisk,
    material: d.material,
    bauform: d.bauform,
    healthFlags: parseStringArray(d.healthFlags),
    retentionNotes: d.retentionNotes,
    referenceImages: d._count.referenceImages,
    createdAt: iso(d.createdAt)!,
    version: d.version,
    notes,
  };
}

/** Angereicherte Geräteliste: Inventar + Entscheidungs-Metadaten + verknüpfte Notes inline. */
export async function listDevicesV2(username: string, opts: ListDevicesOptions = {}): Promise<DeviceListResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);
  const now = new Date();
  const includeNotes = opts.includeNotes ?? true;
  const devices = await prisma.device.findMany({
    where: {
      userId,
      ...(opts.deviceId ? { id: opts.deviceId } : {}),
      // Archivierte per Default ausblenden (K-09): ausgemusterte/verbotene Geräte sollen nicht als
      // aktives Inventar erscheinen. Mit includeArchived:true trotzdem mitliefern.
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    select: deviceViewSelect,
  });
  // includeNotes:false (K-10) spart den teuersten Teil des Calls — die (teils mehrfach verknüpften)
  // Inline-Notes werden dann gar nicht geladen.
  const [notesByEntity, categories] = await Promise.all([
    includeNotes
      ? notesForEntities(userId, devices.map((d) => ({ entityType: "device" as const, entityId: d.id })), {}, undefined, timezone)
      : null,
    listCategoryViews(userId, iso),
  ]);
  return {
    schemaVersion: 5,
    ...buildEnvelope(now, iso, timezone),
    user: username,
    returnedCount: devices.length,
    devices: devices.map((d) => toDeviceMetaView(d, notesByEntity?.get(entityKey("device", d.id)) ?? [], iso)),
    categories,
  };
}

/** Der Geräte-View NACH einem Write, gebaut aus der Zeile, die der Write ohnehin zurückgibt —
 *  `newState` ist damit dasselbe DTO, das `get_devices` liefert, ohne dieselbe Zeile ein zweites Mal
 *  zu lesen. ALLE Reads über `tx`: der globale Client würde gegen die offene Transaktion deadlocken.
 *
 *  `withNotes: false` überspringt die Notes-Abfrage — die teuerste der drei (Relations-Filter über
 *  `NoteRef`) und für ein soeben angelegtes Gerät nachweislich leer. */
async function deviceViewFrom(tx: TxClient, userId: string, row: DeviceViewRow, withNotes: boolean): Promise<DeviceMetaView> {
  const tz = await tzOf(userId, tx);
  const notes = withNotes
    ? (await notesForEntities(userId, [{ entityType: "device", entityId: row.id }], {}, tx, tz)).get(entityKey("device", row.id)) ?? []
    : [];
  return toDeviceMetaView(row, notes, makeIso(tz));
}

// ── Write: set_device_meta ──────────────────────────────────────────────────

export interface SetDeviceMetaArgs extends DeviceRef {
  /** OCC-Token — siehe occEdit (writeFramework). */
  expectedVersion?: number;
  securityLevel?: string;
  lookalikeClusterId?: string | null;
  /** `null` setzen = „nicht beurteilt" (K-08), `true`/`false` = abstreifbar/sicher. */
  pullOffRisk?: boolean | null;
  material?: string | null;
  bauform?: string | null;
  healthFlags?: string[];
  retentionNotes?: string | null;
  /** true = archivieren (aus dem aktiven Inventar nehmen), false = reaktivieren (K-09). */
  archived?: boolean;
}

/** Nur die für Snapshot/Resolve nötigen Spalten — nicht der volle Geräte-Datensatz. */
const metaResolveSelect = {
  id: true, name: true, version: true, archivedAt: true, imageUrl: true,
  securityLevel: true, lookalikeClusterId: true, pullOffRisk: true,
  material: true, bauform: true, healthFlags: true, retentionNotes: true,
} as const;

type MetaRow = {
  id: string; name: string; version: number; archivedAt: Date | null; imageUrl: string | null;
  securityLevel: string | null; lookalikeClusterId: string | null;
  pullOffRisk: boolean | null; material: string | null; bauform: string | null;
  healthFlags: string | null; retentionNotes: string | null;
};

/** Ein Gerät per Name ODER id — die Referenz-Form von `set_device_meta` und `delete_device`.
 *  (`upsert_device` zielt bewusst nur über `id`: dort ist `name` ein zu schreibendes Feld.) */
export interface DeviceRef {
  deviceName?: string;
  deviceId?: string;
}

/** Resolviert das Zielgerät (per id oder Name) innerhalb des Users, schmaler Select. `client` MUSS
 *  `tx` sein, wenn dies in einem write-apply läuft (sonst Deadlock auf der SQLite-Verbindung der
 *  offenen Transaktion); `prisma` für den preview-Pfad (keine Transaktion offen). */
async function resolveDevice(client: TxClient, userId: string, args: DeviceRef): Promise<MetaRow> {
  if (args.deviceId) {
    const d = await client.device.findFirst({ where: { id: args.deviceId, userId }, select: metaResolveSelect });
    if (!d) throw new Error(`Device not found: ${args.deviceId}`);
    return d;
  }
  if (args.deviceName) {
    const devices = await client.device.findMany({ where: { userId }, select: metaResolveSelect });
    const match = matchByNameCI(devices, args.deviceName);
    if (!match) throw new Error(`Device not found: "${args.deviceName}". Available: ${devices.map((d) => d.name).join(", ") || "none"}`);
    return match;
  }
  throw new Error("Device reference required: pass `deviceId` or `deviceName`.");
}

/** Skalar-Snapshot der Metadaten fürs Diffen. `healthFlags` wird als ARRAY normalisiert (K-16,
 *  MCP-Restliste 2026-07-17) — die Spalte ist ein JSON-String, aber get_devices/newState und der
 *  Diff müssen alle dieselbe Array-Form zeigen, sonst driftet die Vorschau vom echten Zustand. */
const metaSnapshot = (d: MetaRow) => ({
  securityLevel: d.securityLevel, lookalikeClusterId: d.lookalikeClusterId, pullOffRisk: d.pullOffRisk,
  material: d.material, bauform: d.bauform, healthFlags: parseStringArray(d.healthFlags), retentionNotes: d.retentionNotes,
  archived: d.archivedAt !== null,
});
type MetaSnapshot = ReturnType<typeof metaSnapshot>;

/** Projiziert den Nachher-Zustand aus (before, args) — dieselbe Feld-Merge-Logik wie der `apply`-
 *  `data`-Spread, nur in-memory. Geteilt von preview (Diff ohne Commit) und apply (Diff == Commit),
 *  damit Vorschau und tatsächlicher Write strukturell nicht auseinanderlaufen (N-15). */
const projectMeta = (before: MetaSnapshot, args: SetDeviceMetaArgs): MetaSnapshot => ({
  securityLevel: args.securityLevel !== undefined ? args.securityLevel : before.securityLevel,
  lookalikeClusterId: args.lookalikeClusterId !== undefined ? args.lookalikeClusterId : before.lookalikeClusterId,
  pullOffRisk: args.pullOffRisk !== undefined ? args.pullOffRisk : before.pullOffRisk,
  material: args.material !== undefined ? args.material : before.material,
  bauform: args.bauform !== undefined ? args.bauform : before.bauform,
  healthFlags: args.healthFlags !== undefined ? args.healthFlags : before.healthFlags,
  retentionNotes: args.retentionNotes !== undefined ? args.retentionNotes : before.retentionNotes,
  archived: args.archived !== undefined ? args.archived : before.archived,
});

export const setDeviceMetaDef: WriteDef<SetDeviceMetaArgs, DeviceMetaView> = {
  tool: "set_device_meta",
  validate(args) {
    if (args.securityLevel != null && !SECURITY_LEVELS.includes(args.securityLevel as typeof SECURITY_LEVELS[number])) {
      throw new Error(`Invalid securityLevel: "${args.securityLevel}". Allowed: ${SECURITY_LEVELS.join(", ")}.`);
    }
    return args;
  },
  async preview(ctx, args) {
    const d = await resolveDevice(prisma, ctx.targetUserId, args);
    // Check-only (Rückgabe verworfen): der Versions-Konflikt soll schon im dryRun sichtbar sein.
    occEdit(args.expectedVersion, d.version, `device "${d.name}"`);
    const before = metaSnapshot(d);
    // N-15: before/after fürs Framework mitliefern → dryRun zeigt denselben diff wie der Commit.
    return { preview: { device: d.name, version: d.version, before }, before, after: projectMeta(before, args) };
  },
  async apply(tx, ctx, args) {
    const d = await resolveDevice(tx, ctx.targetUserId, args);
    const bump = occEdit(args.expectedVersion, d.version, `device "${d.name}"`);
    const before = metaSnapshot(d);
    const data = {
      ...(args.securityLevel !== undefined ? { securityLevel: args.securityLevel } : {}),
      ...(args.lookalikeClusterId !== undefined ? { lookalikeClusterId: args.lookalikeClusterId } : {}),
      ...(args.pullOffRisk !== undefined ? { pullOffRisk: args.pullOffRisk } : {}),
      ...(args.material !== undefined ? { material: args.material } : {}),
      ...(args.bauform !== undefined ? { bauform: args.bauform } : {}),
      ...(args.healthFlags !== undefined ? { healthFlags: JSON.stringify(args.healthFlags) } : {}),
      ...(args.retentionNotes !== undefined ? { retentionNotes: args.retentionNotes } : {}),
      // archived (K-09): der Zustand liegt in archivedAt (DateTime?), nicht in einer bool-Spalte.
      ...(args.archived !== undefined ? { archivedAt: args.archived ? new Date() : null } : {}),
    };
    // No-op-Edit (keine Felder angegeben): nicht schreiben und v.a. die Version NICHT bumpen —
    // ein Bump würde die expectedVersion aller anderen Leser grundlos invalidieren.
    const row = Object.keys(data).length
      ? await tx.device.update({ where: { id: d.id }, data: { ...bump, ...data }, select: deviceViewSelect })
      : await tx.device.findUniqueOrThrow({ where: { id: d.id }, select: deviceViewSelect });
    // Diff aus derselben projectMeta wie die Vorschau (nicht aus dem Re-Read) — so ist der Commit-Diff
    // per Konstruktion identisch mit dem, was der dryRun gezeigt hat (N-15).
    return {
      newState: await deviceViewFrom(tx, ctx.targetUserId, row, true),
      resultRef: d.id,
      diff: diffFields(before, projectMeta(before, args)),
    };
  },
};

// ── Write: upsert_device ────────────────────────────────────────────────────

export interface UpsertDeviceArgs {
  /** Bestehendes Gerät bearbeiten; weglassen = neues anlegen. Bewusst KEIN `deviceName`-Zugriff:
   *  hier ist `name` ein zu schreibendes Feld, ein Name als Ziel wäre zweideutig. */
  id?: string;
  /** OCC-Token — siehe occEdit (writeFramework). */
  expectedVersion?: number;
  name?: string;
  description?: string | null;
  /** Kategorie-Zuordnung; `null` = aus der Kategorie nehmen. ids stehen in get_devices.categories. */
  categoryId?: string | null;
  purchasePrice?: number | null;
  currency?: string | null;
  /** Verlangt eine Kontrolle mit diesem Gerät den handschriftlichen Code im Foto? */
  requireInspectionCode?: boolean;
}

const inventoryResolveSelect = {
  id: true, name: true, version: true, archivedAt: true, description: true,
  categoryId: true, purchasePrice: true, currency: true, requireInspectionCode: true,
} as const;

type InventoryRow = {
  id: string; name: string; version: number; archivedAt: Date | null; description: string | null;
  categoryId: string | null; purchasePrice: number | null; currency: string | null; requireInspectionCode: boolean;
};

const inventorySnapshot = (d: InventoryRow) => ({
  name: d.name, description: d.description, categoryId: d.categoryId,
  purchasePrice: d.purchasePrice, currency: d.currency, requireInspectionCode: d.requireInspectionCode,
});
type InventorySnapshot = ReturnType<typeof inventorySnapshot>;

/** Der Ausgangszustand eines NEUEN Geräts — die Schema-Defaults. Damit läuft das Anlegen durch
 *  dieselbe Projektion + Preis/Währungs-Prüfung wie ein Edit, statt eine zweite Kette zu bekommen. */
const NEW_DEVICE_BASE: InventorySnapshot = {
  name: "", description: null, categoryId: null, purchasePrice: null, currency: null, requireInspectionCode: true,
};

/** Feld-Merge eines Inventar-Edits — die EINE Stelle, an der aus Args Spalten-Werte werden.
 *  `projectInventory` spreadet exakt dieses Ergebnis, also können Vorschau und Commit nicht
 *  auseinanderlaufen (N-15). */
const inventoryData = (args: UpsertDeviceArgs): Partial<InventorySnapshot> => ({
  ...(args.name !== undefined ? { name: args.name.trim() } : {}),
  ...(args.description !== undefined ? { description: args.description?.trim() || null } : {}),
  ...(args.categoryId !== undefined ? { categoryId: args.categoryId || null } : {}),
  ...(args.purchasePrice !== undefined ? { purchasePrice: args.purchasePrice } : {}),
  ...(args.currency !== undefined ? { currency: args.currency || null } : {}),
  ...(args.requireInspectionCode !== undefined ? { requireInspectionCode: args.requireInspectionCode } : {}),
});

const projectInventory = (before: InventorySnapshot, args: UpsertDeviceArgs): InventorySnapshot =>
  ({ ...before, ...inventoryData(args) });

/** Was ein Verstoss dem AGENTEN sagt. Die Prüfung selbst steht in `validateDeviceInput` (geteilt mit
 *  den Geräte-Routen); die geben denselben Code übersetzt an den Browser, hier braucht es einen Satz
 *  samt Grenzwert — derselbe Schnitt wie bei den Kategorie-Regeln. */
const DEVICE_VALIDATION_MESSAGES: Record<DeviceValidationCode, string> = {
  DEVICE_NAME_REQUIRED: "`name` must not be empty.",
  DEVICE_NAME_TOO_LONG: `name too long (max. ${DEVICE_NAME_MAX_LENGTH} characters).`,
  DEVICE_DESCRIPTION_TOO_LONG: `description too long (max. ${DEVICE_DESCRIPTION_MAX_LENGTH} characters).`,
  DEVICE_INVALID_PRICE: "purchasePrice must be a finite number >= 0.",
  DEVICE_INVALID_CURRENCY: `Invalid currency. Allowed: ${VALID_CURRENCIES.join(", ")}.`,
  DEVICE_CURRENCY_REQUIRED: `purchasePrice requires a currency (${VALID_CURRENCIES.join(" | ")}).`,
};

/** Prüft den PROJIZIERTEN Zustand, nicht den Aufruf: wer nur den Preis setzt, erbt die bestehende
 *  Währung — „ein Preis braucht eine Währung" ist eine Aussage über das Gerät NACH der Änderung. */
function assertValidDevice(after: InventorySnapshot): void {
  const code = validateDeviceInput(after);
  if (code) throw new Error(DEVICE_VALIDATION_MESSAGES[code]);
}

/** Prüft die Kategorie-Zuordnung gegen den Besitzer des Geräts — über dieselbe Service-Funktion wie
 *  die Geräte-Routen. Nur wenn `categoryId` überhaupt mitkam (undefined = Feld unangetastet). */
async function assertOwnedCategory(client: TxClient, userId: string, categoryId: string | null | undefined): Promise<void> {
  if (categoryId === undefined) return;
  const res = await resolveOwnedCategory(categoryId, userId, client);
  if (!res.ok) throw new Error(`Invalid category: "${categoryId}" is unknown or belongs to another user.`);
}

/** Ein archiviertes Gerät ist nicht bearbeitbar — dieselbe Schranke wie PATCH /api/devices/[id].
 *  Zurückgeholt wird es über `set_device_meta { archived: false }`. */
function assertNotArchived(d: InventoryRow): void {
  if (d.archivedAt) {
    throw new Error(`Device "${d.name}" is archived and cannot be edited — restore it first via set_device_meta { archived: false }.`);
  }
}

async function resolveDeviceForEdit(client: TxClient, userId: string, id: string): Promise<InventoryRow> {
  const d = await client.device.findFirst({ where: { id, userId }, select: inventoryResolveSelect });
  if (!d) throw new Error(`Device not found: ${id}`);
  return d;
}

export const upsertDeviceDef: WriteDef<UpsertDeviceArgs, DeviceMetaView> = {
  tool: "upsert_device",
  validate(args) {
    assertVersionRequiresId(args);
    if (!args.id && !args.name?.trim()) throw new Error("A new device requires `name`.");
    // Feld-für-Feld, was ohne den Bestand beurteilbar ist. Preis und Währung fehlen hier bewusst:
    // ihre Regel gilt dem projizierten Zustand und läuft darum in preview/apply (assertValidDevice).
    const code = validateDeviceInput({ name: args.name, description: args.description, currency: args.currency ?? undefined });
    if (code) throw new Error(DEVICE_VALIDATION_MESSAGES[code]);
    return args;
  },
  async preview(ctx, args) {
    await assertOwnedCategory(prisma, ctx.targetUserId, args.categoryId);
    if (!args.id) {
      const after = projectInventory(NEW_DEVICE_BASE, args);
      assertValidDevice(after);
      return { preview: { action: "create", device: after } };
    }
    const d = await resolveDeviceForEdit(prisma, ctx.targetUserId, args.id);
    assertNotArchived(d);
    // Check-only (Rückgabe verworfen): der Versions-Konflikt soll schon im dryRun sichtbar sein.
    occEdit(args.expectedVersion, d.version, `device "${d.name}"`);
    const before = inventorySnapshot(d);
    const after = projectInventory(before, args);
    assertValidDevice(after);
    return { preview: { action: "edit", device: d.name, version: d.version, before }, before, after };
  },
  async apply(tx, ctx, args) {
    await assertOwnedCategory(tx, ctx.targetUserId, args.categoryId);

    if (!args.id) {
      assertValidDevice(projectInventory(NEW_DEVICE_BASE, args));
      // `name` kommt aus `inventoryData` (validate garantiert es) — der Cast bedient nur den Typ,
      // den Prisma für ein Pflichtfeld verlangt.
      const created = await tx.device.create({
        data: { userId: ctx.targetUserId, ...inventoryData(args), name: args.name!.trim() },
        select: deviceViewSelect,
      });
      return { newState: await deviceViewFrom(tx, ctx.targetUserId, created, false), resultRef: created.id };
    }

    const d = await resolveDeviceForEdit(tx, ctx.targetUserId, args.id);
    assertNotArchived(d);
    const bump = occEdit(args.expectedVersion, d.version, `device "${d.name}"`);
    const before = inventorySnapshot(d);
    assertValidDevice(projectInventory(before, args));
    const data = inventoryData(args);
    // No-op-Edit: nicht schreiben und v.a. die Version NICHT bumpen — ein Bump würde die
    // expectedVersion aller anderen Leser grundlos invalidieren.
    const row = Object.keys(data).length
      ? await tx.device.update({ where: { id: d.id }, data: { ...bump, ...data }, select: deviceViewSelect })
      : await tx.device.findUniqueOrThrow({ where: { id: d.id }, select: deviceViewSelect });
    return {
      newState: await deviceViewFrom(tx, ctx.targetUserId, row, true),
      resultRef: d.id,
      diff: diffFields(before, projectInventory(before, args)),
    };
  },
};

// ── Write: delete_device ────────────────────────────────────────────────────

export type DeleteDeviceArgs = DeviceRef;

export interface DeleteDeviceResult {
  id: string;
  name: string;
  /** `deleted` = hart gelöscht (es gab keine Einträge), `archived` = Historie bewahrt. */
  outcome: "deleted" | "archived";
  entryCount: number;
}

export const deleteDeviceDef: WriteDef<DeleteDeviceArgs, DeleteDeviceResult> = {
  tool: "delete_device",
  async preview(ctx, args) {
    const d = await resolveDevice(prisma, ctx.targetUserId, args);
    // Der Plan kommt aus dem Service — die Vorschau kündigt damit exakt den Ausgang an, den der
    // Commit danach nimmt, statt die Verzweigung ein zweites Mal zu treffen.
    const plan = await planDeviceRemoval(prisma, d);
    return { preview: { action: plan.outcome === "deleted" ? "delete" : "archive", device: d.name, ...plan } };
  },
  async apply(tx, ctx, args) {
    const d = await resolveDevice(tx, ctx.targetUserId, args);
    const plan = await planDeviceRemoval(tx, d);
    const orphanFiles = await applyDeviceRemoval(tx, d, plan);
    return {
      newState: { id: d.id, name: d.name, outcome: plan.outcome, entryCount: plan.entryCount },
      resultRef: d.id,
      // Die verwaisten Bilddateien erst NACH dem Commit — ein Rollback nähme sonst die Geräte-Zeile
      // zurück, während die Fotos schon weg wären (siehe WriteResult.afterCommit).
      ...(orphanFiles.length ? { afterCommit: () => deleteUploadedFiles(orphanFiles) } : {}),
    };
  },
};
