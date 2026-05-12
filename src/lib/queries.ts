import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import type { OeffnenGrund } from "@/lib/constants";

// ── Shared types ────────────────────────────────────────────────────────────

/** Prisma transaction client — parameter type passed to callbacks of `$transaction`. */
export type PrismaTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface DeviceOption {
  id: string;
  name: string;
  imageUrl: string | null;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Returns active (non-archived) KG devices for a user, ordered by creation date.
 *  KG-specific filter: includes only devices in the built-in KG category — Plug, Collar
 *  etc. are excluded because Verschluss/Öffnen-Flows operate on KG only. Devices without
 *  a category are also included for legacy data (pre-DeviceCategory migration safety). */
export async function getUserDeviceOptions(userId: string): Promise<DeviceOption[]> {
  return prisma.device.findMany({
    where: {
      userId,
      archivedAt: null,
      OR: [
        { category: { isBuiltIn: true } },
        { categoryId: null },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });
}

/** Returns true if the user is currently locked (latest VERSCHLUSS/OEFFNEN entry is VERSCHLUSS).
 *
 *  KG-only by design: Sperrzeiten, VerschlussAnforderung, Strafen, Kontroll-Anforderungen and
 *  the "Verschlossen seit X" banner all rely on this single global lock state. Per-category
 *  wear status (Plug, Collar, ...) is determined separately from `buildPairs` results in the
 *  pages that need it — never via this function. */
export async function getIsLocked(userId: string): Promise<boolean> {
  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true },
  });
  return latest?.type === "VERSCHLUSS";
}

/** Result row for a currently-active wear session in a non-KG DeviceCategory. */
export interface ActiveWearSession {
  categoryId: string;
  categoryName: string;
  deviceId: string;
  deviceName: string;
  since: Date;
}

/** Result of `prepareWearEntry` — never thrown, returned for the route to inspect. */
export type WearPrepareResult =
  | { ok: true; categoryId: string }
  | { ok: false; code:
      | "WEAR_DEVICE_REQUIRED"
      | "WEAR_DEVICE_NO_CATEGORY"
      | "WEAR_DEVICE_KG"
      | "WEAR_PHOTO_REQUIRED"
      | "ALREADY_WEARING"
      | "NOT_WEARING"
      | "TIME_BEFORE";
    };

/** Validates a WEAR_BEGIN/WEAR_END create-payload against the device's category and the
 *  user's session state. Runs inside the caller's transaction so reads are consistent.
 *  Both /api/entries and /api/admin/entries call this — single source of truth for the
 *  WEAR-pair invariants. */
export async function prepareWearEntry(
  tx: PrismaTx,
  userId: string,
  type: "WEAR_BEGIN" | "WEAR_END",
  deviceId: string | undefined,
  startTime: string | Date,
  imageUrl: string | null | undefined,
): Promise<WearPrepareResult> {
  if (!deviceId) return { ok: false, code: "WEAR_DEVICE_REQUIRED" };
  const dev = await tx.device.findUnique({
    where: { id: deviceId },
    select: { categoryId: true, category: { select: { isBuiltIn: true, requirePhoto: true } } },
  });
  if (!dev?.categoryId) return { ok: false, code: "WEAR_DEVICE_NO_CATEGORY" };
  if (dev.category?.isBuiltIn) return { ok: false, code: "WEAR_DEVICE_KG" };
  if (type === "WEAR_BEGIN" && dev.category?.requirePhoto && !imageUrl) {
    return { ok: false, code: "WEAR_PHOTO_REQUIRED" };
  }

  const latestWear = await tx.entry.findFirst({
    where: {
      userId,
      type: { in: ["WEAR_BEGIN", "WEAR_END"] },
      device: { categoryId: dev.categoryId },
    },
    orderBy: { startTime: "desc" },
    select: { type: true, startTime: true },
  });
  if (type === "WEAR_BEGIN" && latestWear?.type === "WEAR_BEGIN") {
    return { ok: false, code: "ALREADY_WEARING" };
  }
  if (type === "WEAR_END" && (!latestWear || latestWear.type !== "WEAR_BEGIN")) {
    return { ok: false, code: "NOT_WEARING" };
  }
  if (latestWear && new Date(startTime) <= latestWear.startTime) {
    return { ok: false, code: "TIME_BEFORE" };
  }
  return { ok: true, categoryId: dev.categoryId };
}

/** Returns all currently active wear sessions across non-KG categories.
 *  Used by the dashboard to render parallel session cards. */
export async function getActiveWearSessions(userId: string): Promise<(ActiveWearSession & {
  categoryColor: string;
  categoryIcon: string;
})[]> {
  // One query: latest WEAR-entry per device, joined with device + category.
  // For typical usage (≤10 categories per user) this is acceptable; index on (userId, type, startTime DESC).
  const latestPerDevice = await prisma.entry.findMany({
    where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] }, deviceId: { not: null } },
    orderBy: { startTime: "desc" },
    select: {
      type: true,
      startTime: true,
      deviceId: true,
      device: { select: { id: true, name: true, category: { select: { id: true, name: true, color: true, icon: true, isBuiltIn: true } } } },
    },
  });
  // Group by deviceId, keep only the latest per device.
  const seenDevices = new Set<string>();
  const sessions: (ActiveWearSession & { categoryColor: string; categoryIcon: string })[] = [];
  for (const e of latestPerDevice) {
    if (!e.deviceId || seenDevices.has(e.deviceId)) continue;
    seenDevices.add(e.deviceId);
    if (e.type !== "WEAR_BEGIN" || !e.device?.category || e.device.category.isBuiltIn) continue;
    sessions.push({
      categoryId: e.device.category.id,
      categoryName: e.device.category.name,
      categoryColor: e.device.category.color,
      categoryIcon: e.device.category.icon,
      deviceId: e.device.id,
      deviceName: e.device.name,
      since: e.startTime,
    });
  }
  return sessions;
}

/** Returns the active wear session in a category, or null if none.
 *  An "active session" = latest WEAR_BEGIN/WEAR_END entry on a device of this category is WEAR_BEGIN. */
export async function getActiveWearSessionForCategory(
  userId: string,
  categoryId: string,
): Promise<ActiveWearSession | null> {
  const latest = await prisma.entry.findFirst({
    where: {
      userId,
      type: { in: ["WEAR_BEGIN", "WEAR_END"] },
      device: { categoryId },
    },
    orderBy: { startTime: "desc" },
    select: {
      type: true,
      startTime: true,
      device: { select: { id: true, name: true, category: { select: { id: true, name: true } } } },
    },
  });
  if (latest?.type !== "WEAR_BEGIN" || !latest.device || !latest.device.category) return null;
  return {
    categoryId: latest.device.category.id,
    categoryName: latest.device.category.name,
    deviceId: latest.device.id,
    deviceName: latest.device.name,
    since: latest.startTime,
  };
}

/** Returns non-KG device categories with tracking enabled, ordered by sortOrder then createdAt. */
export async function getNonKgTrackingCategories(userId: string) {
  return prisma.deviceCategory.findMany({
    where: { userId, isBuiltIn: false, trackingEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, color: true, icon: true },
  });
}

/** Returns the currently active TrainingVorgabe for a user, or null. */
export async function getActiveVorgabe(userId: string, now: Date) {
  return prisma.trainingVorgabe.findFirst({
    where: {
      userId,
      gueltigAb: { lte: now },
      OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }],
    },
    orderBy: { gueltigAb: "desc" },
  });
}

/**
 * Validates that a device belongs to a user and is active (not archived).
 * Accepts an optional Prisma transaction client — falls back to the default client.
 * Returns the device if valid, or null if invalid/missing.
 */
export async function validateDeviceOwnership(
  deviceId: string,
  userId: string,
  tx?: PrismaTx,
) {
  const client = tx ?? prisma;
  const device = await client.device.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== userId || device.archivedAt) return null;
  return device;
}

/** Shared `where` for currently-active Sperrzeiten (not withdrawn, not ended). */
function activeSperrzeitWhere(userIdFilter: string | { in: string[] }, now: Date) {
  return {
    userId: userIdFilter,
    art: "SPERRZEIT" as const,
    withdrawnAt: null,
    OR: [{ endetAt: { gt: now } }, { endetAt: null }],
  };
}

/** Returns all currently-active Sperrzeiten for a user (or all users if `userIds` given). */
export async function getActiveSperrzeiten(
  userId: string | { userIds: string[] },
  tx?: PrismaTx,
) {
  const client = tx ?? prisma;
  const filter = typeof userId === "string" ? userId : { in: userId.userIds };
  return client.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(filter, new Date()),
    orderBy: { createdAt: "desc" },
  });
}

/** Returns the single active Sperrzeit for a user, or null. */
export async function getActiveSperrzeit(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  return client.verschlussAnforderung.findFirst({
    where: activeSperrzeitWhere(userId, new Date()),
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Releases active SPERRZEIT periods when a user opens their device.
 * The release is skipped (Sperrzeit kept active) for cleaning openings where
 * both `user.reinigungErlaubt` and *every* active Sperrzeit's `reinigungErlaubt`
 * are true. Must be called inside a transaction.
 *
 * `userReinigungErlaubt` may be passed by callers that already loaded the user
 * to avoid a redundant fetch — otherwise the function loads it itself.
 *
 * Returns true if at least one Sperrzeit was withdrawn (for notification routing).
 */
export async function releaseSperrzeitenOnOpen(
  userId: string,
  oeffnenGrund: OeffnenGrund | string | null | undefined,
  tx: PrismaTx,
  userReinigungErlaubt?: boolean,
): Promise<boolean> {
  const activeSperrzeiten = await tx.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(userId, new Date()),
    select: { id: true, reinigungErlaubt: true },
  });
  if (activeSperrzeiten.length === 0) return false;

  const effectiveUserErlaubt = userReinigungErlaubt ?? (
    await tx.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true } })
  )?.reinigungErlaubt ?? false;

  const allowedCleaning =
    oeffnenGrund === "REINIGUNG" &&
    effectiveUserErlaubt === true &&
    activeSperrzeiten.every((s) => s.reinigungErlaubt);
  if (allowedCleaning) return false;

  await tx.verschlussAnforderung.updateMany({
    where: { id: { in: activeSperrzeiten.map((s) => s.id) } },
    data: { withdrawnAt: new Date() },
  });
  return true;
}
