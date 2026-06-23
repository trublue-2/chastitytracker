import { prisma } from "@/lib/prisma";
import { resolveUserId, iso, notesForEntities, entityKey, parseStringArray, type NoteDTO } from "@/lib/mcp/common";
import { diffFields, type WriteDef } from "@/lib/mcp/writeFramework";

/** Geräte-Metadaten, die Keyholder-Entscheidungen tragen (§2) + angereicherte Geräteliste mit
 *  Inline-Notes. MCP-only, additiv. */

export const SECURITY_LEVELS = ["SECURING", "TRUST_ONLY"] as const;

export interface DeviceMetaView {
  id: string;
  name: string;
  category: string;
  isKg: boolean;
  archived: boolean;
  description: string | null;
  securityLevel: string | null;
  lookalikeClusterId: string | null;
  abstreifbar: boolean;
  material: string | null;
  bauform: string | null;
  healthFlags: string[];
  retentionNotes: string | null;
  referenceImages: number;
  createdAt: string;
  notes: NoteDTO[];
}

export interface DeviceListResult {
  schemaVersion: 2;
  user: string;
  devices: DeviceMetaView[];
}

/** Vollständiger Select für die angereicherte Geräte-Ansicht (von Liste + Single-Re-Fetch geteilt). */
const deviceViewSelect = {
  id: true, name: true, description: true, archivedAt: true, createdAt: true,
  securityLevel: true, lookalikeClusterId: true, abstreifbar: true,
  material: true, bauform: true, healthFlags: true, retentionNotes: true,
  category: { select: { name: true, isBuiltIn: true } },
  _count: { select: { referenceImages: true } },
} as const;

type DeviceViewRow = {
  id: string; name: string; description: string | null; archivedAt: Date | null; createdAt: Date;
  securityLevel: string | null; lookalikeClusterId: string | null; abstreifbar: boolean;
  material: string | null; bauform: string | null; healthFlags: string | null; retentionNotes: string | null;
  category: { name: string; isBuiltIn: boolean } | null;
  _count: { referenceImages: number };
};

/** Mappt eine Geräte-Zeile (+ inline Notes) auf das stabile MCP-DTO. Eine Quelle für Liste + Write. */
function toDeviceMetaView(d: DeviceViewRow, notes: NoteDTO[]): DeviceMetaView {
  return {
    id: d.id,
    name: d.name,
    category: d.category?.name ?? "—",
    isKg: d.category?.isBuiltIn ?? false,
    archived: d.archivedAt !== null,
    description: d.description,
    securityLevel: d.securityLevel,
    lookalikeClusterId: d.lookalikeClusterId,
    abstreifbar: d.abstreifbar,
    material: d.material,
    bauform: d.bauform,
    healthFlags: parseStringArray(d.healthFlags),
    retentionNotes: d.retentionNotes,
    referenceImages: d._count.referenceImages,
    createdAt: iso(d.createdAt)!,
    notes,
  };
}

/** Angereicherte Geräteliste: Inventar + Entscheidungs-Metadaten + verknüpfte Notes inline. */
export async function listDevicesV2(username: string): Promise<DeviceListResult> {
  const userId = await resolveUserId(username);
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    select: deviceViewSelect,
  });
  const notesByEntity = await notesForEntities(userId, devices.map((d) => ({ entityType: "device" as const, entityId: d.id })));
  return {
    schemaVersion: 2,
    user: username,
    devices: devices.map((d) => toDeviceMetaView(d, notesByEntity.get(entityKey("device", d.id)) ?? [])),
  };
}

// ── Write: set_device_meta ──────────────────────────────────────────────────

export interface SetDeviceMetaArgs {
  /** Gerät per Name (case-insensitiv) ODER id. Eines von beiden ist Pflicht. */
  deviceName?: string;
  deviceId?: string;
  securityLevel?: string;
  lookalikeClusterId?: string | null;
  abstreifbar?: boolean;
  material?: string | null;
  bauform?: string | null;
  healthFlags?: string[];
  retentionNotes?: string | null;
}

/** Nur die für Snapshot/Resolve nötigen Spalten — nicht der volle Geräte-Datensatz. */
const metaResolveSelect = {
  id: true, name: true,
  securityLevel: true, lookalikeClusterId: true, abstreifbar: true,
  material: true, bauform: true, healthFlags: true, retentionNotes: true,
} as const;

type MetaRow = {
  id: string; name: string; securityLevel: string | null; lookalikeClusterId: string | null;
  abstreifbar: boolean; material: string | null; bauform: string | null;
  healthFlags: string | null; retentionNotes: string | null;
};

/** Resolviert das Zielgerät (per id oder Name) innerhalb des Users — lesend über `prisma`, schmaler
 *  Select. Die Mutation läuft danach per id im Transaktions-Client. */
async function resolveDevice(userId: string, args: SetDeviceMetaArgs): Promise<MetaRow> {
  if (args.deviceId) {
    const d = await prisma.device.findFirst({ where: { id: args.deviceId, userId }, select: metaResolveSelect });
    if (!d) throw new Error(`Device not found: ${args.deviceId}`);
    return d;
  }
  if (args.deviceName) {
    const target = args.deviceName.trim().toLowerCase();
    const devices = await prisma.device.findMany({ where: { userId }, select: metaResolveSelect });
    const match = devices.find((d) => d.name.toLowerCase() === target);
    if (!match) throw new Error(`Device not found: "${args.deviceName}". Available: ${devices.map((d) => d.name).join(", ") || "none"}`);
    return match;
  }
  throw new Error("set_device_meta requires deviceName or deviceId.");
}

const metaSnapshot = (d: MetaRow) => ({
  securityLevel: d.securityLevel, lookalikeClusterId: d.lookalikeClusterId, abstreifbar: d.abstreifbar,
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
    const d = await resolveDevice(ctx.targetUserId, args);
    return { device: d.name, before: metaSnapshot(d) };
  },
  async apply(tx, ctx, args) {
    const d = await resolveDevice(ctx.targetUserId, args);
    const before = metaSnapshot(d);
    await tx.device.update({
      where: { id: d.id },
      data: {
        ...(args.securityLevel !== undefined ? { securityLevel: args.securityLevel } : {}),
        ...(args.lookalikeClusterId !== undefined ? { lookalikeClusterId: args.lookalikeClusterId } : {}),
        ...(args.abstreifbar !== undefined ? { abstreifbar: args.abstreifbar } : {}),
        ...(args.material !== undefined ? { material: args.material } : {}),
        ...(args.bauform !== undefined ? { bauform: args.bauform } : {}),
        ...(args.healthFlags !== undefined ? { healthFlags: JSON.stringify(args.healthFlags) } : {}),
        ...(args.retentionNotes !== undefined ? { retentionNotes: args.retentionNotes } : {}),
      },
    });
    // Echten, vollständigen View nach dem Update liefern (kein erfundener Platzhalter-State).
    const fresh = await tx.device.findUniqueOrThrow({ where: { id: d.id }, select: deviceViewSelect });
    const notesByEntity = await notesForEntities(ctx.targetUserId, [{ entityType: "device", entityId: d.id }]);
    const view = toDeviceMetaView(fresh, notesByEntity.get(entityKey("device", d.id)) ?? []);
    return { newState: view, resultRef: d.id, diff: diffFields(before, metaSnapshot(fresh)) };
  },
};
