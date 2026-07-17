import { prisma } from "@/lib/prisma";
import { resolveUserContext, makeIso, buildEnvelope, notesForEntities, entityKey, matchByNameCI, parseStringArray, tzOf, type Iso, type NoteDTO, type Envelope } from "@/lib/mcp/common";
import { diffFields, occEdit, type WriteDef, type TxClient } from "@/lib/mcp/writeFramework";

/** Geräte-Metadaten, die Keyholder-Entscheidungen tragen (explain_model §13) + angereicherte
 *  Geräteliste mit Inline-Notes. MCP-only, additiv. */

export const SECURITY_LEVELS = ["SECURING", "TRUST_ONLY"] as const;

export interface DeviceMetaView {
  id: string;
  name: string;
  category: string;
  isKg: boolean;
  /** false = Inventory-only-Kategorie (z.B. Halsband/Knebel): liefert PER DESIGN keine Trage-
   *  Sessions und fehlt darum in device_stats — Abwesenheit dort ist keine Nichtnutzung. */
  trackingEnabled: boolean;
  archived: boolean;
  description: string | null;
  purchasePrice: number | null;
  currency: string | null;
  securityLevel: string | null;
  lookalikeClusterId: string | null;
  pullOffRisk: boolean;
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
  /** v3: `abstreifbar` → `pullOffRisk` (true = abstreifbar/unsicher); neu `version`, `trackingEnabled`.
   *  generatedAt/timezone/returnedCount sind additiv (N-3, MCP-Restliste 2026-07-17): get_devices war
   *  als einziger V2-Read ohne Zeitanker — kein schemaVersion-Bump, weil rein ergänzend. */
  schemaVersion: 3;
  user: string;
  returnedCount: number;
  devices: DeviceMetaView[];
}

/** Vollständiger Select für die angereicherte Geräte-Ansicht (von Liste + Single-Re-Fetch geteilt). */
const deviceViewSelect = {
  id: true, name: true, description: true, archivedAt: true, createdAt: true,
  purchasePrice: true, currency: true,
  securityLevel: true, lookalikeClusterId: true, pullOffRisk: true,
  material: true, bauform: true, healthFlags: true, retentionNotes: true, version: true,
  category: { select: { name: true, isBuiltIn: true, trackingEnabled: true } },
  _count: { select: { referenceImages: true } },
} as const;

type DeviceViewRow = {
  id: string; name: string; description: string | null; archivedAt: Date | null; createdAt: Date;
  purchasePrice: number | null; currency: string | null;
  securityLevel: string | null; lookalikeClusterId: string | null; pullOffRisk: boolean;
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
    isKg: d.category?.isBuiltIn ?? false,
    trackingEnabled: d.category?.trackingEnabled ?? true,
    archived: d.archivedAt !== null,
    description: d.description,
    purchasePrice: d.purchasePrice,
    currency: d.currency,
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
export async function listDevicesV2(username: string): Promise<DeviceListResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);
  const now = new Date();
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    select: deviceViewSelect,
  });
  const notesByEntity = await notesForEntities(userId, devices.map((d) => ({ entityType: "device" as const, entityId: d.id })), {}, undefined, timezone);
  return {
    schemaVersion: 3,
    ...buildEnvelope(now, iso, timezone),
    user: username,
    returnedCount: devices.length,
    devices: devices.map((d) => toDeviceMetaView(d, notesByEntity.get(entityKey("device", d.id)) ?? [], iso)),
  };
}

// ── Write: set_device_meta ──────────────────────────────────────────────────

export interface SetDeviceMetaArgs {
  /** Gerät per Name (case-insensitiv) ODER id. Eines von beiden ist Pflicht. */
  deviceName?: string;
  deviceId?: string;
  /** OCC-Token — siehe occEdit (writeFramework). */
  expectedVersion?: number;
  securityLevel?: string;
  lookalikeClusterId?: string | null;
  pullOffRisk?: boolean;
  material?: string | null;
  bauform?: string | null;
  healthFlags?: string[];
  retentionNotes?: string | null;
}

/** Nur die für Snapshot/Resolve nötigen Spalten — nicht der volle Geräte-Datensatz. */
const metaResolveSelect = {
  id: true, name: true, version: true,
  securityLevel: true, lookalikeClusterId: true, pullOffRisk: true,
  material: true, bauform: true, healthFlags: true, retentionNotes: true,
} as const;

type MetaRow = {
  id: string; name: string; version: number; securityLevel: string | null; lookalikeClusterId: string | null;
  pullOffRisk: boolean; material: string | null; bauform: string | null;
  healthFlags: string | null; retentionNotes: string | null;
};

/** Resolviert das Zielgerät (per id oder Name) innerhalb des Users, schmaler Select. `client` MUSS
 *  `tx` sein, wenn dies in einem write-apply läuft (sonst Deadlock auf der SQLite-Verbindung der
 *  offenen Transaktion); `prisma` für den preview-Pfad (keine Transaktion offen). */
async function resolveDevice(client: TxClient, userId: string, args: SetDeviceMetaArgs): Promise<MetaRow> {
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
  throw new Error("set_device_meta requires deviceName or deviceId.");
}

const metaSnapshot = (d: MetaRow) => ({
  securityLevel: d.securityLevel, lookalikeClusterId: d.lookalikeClusterId, pullOffRisk: d.pullOffRisk,
  material: d.material, bauform: d.bauform, healthFlags: d.healthFlags, retentionNotes: d.retentionNotes,
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
    return { device: d.name, version: d.version, before: metaSnapshot(d) };
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
    };
    // No-op-Edit (keine Felder angegeben): nicht schreiben und v.a. die Version NICHT bumpen —
    // ein Bump würde die expectedVersion aller anderen Leser grundlos invalidieren.
    if (Object.keys(data).length) {
      await tx.device.update({ where: { id: d.id }, data: { ...bump, ...data } });
    }
    // Echten, vollständigen View nach dem Update liefern (kein erfundener Platzhalter-State).
    // ALLE Reads über `tx` — globaler prisma-Client hier würde gegen die offene Transaktion deadlocken.
    const [fresh, tz] = await Promise.all([
      tx.device.findUniqueOrThrow({ where: { id: d.id }, select: deviceViewSelect }),
      tzOf(ctx.targetUserId, tx),
    ]);
    const notesByEntity = await notesForEntities(ctx.targetUserId, [{ entityType: "device", entityId: d.id }], {}, tx, tz);
    const view = toDeviceMetaView(fresh, notesByEntity.get(entityKey("device", d.id)) ?? [], makeIso(tz));
    return { newState: view, resultRef: d.id, diff: diffFields(before, metaSnapshot(fresh)) };
  },
};
