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

/** Returns active (non-archived) devices for a user, ordered by creation date. */
export async function getUserDeviceOptions(userId: string): Promise<DeviceOption[]> {
  return prisma.device.findMany({
    where: { userId, archivedAt: null },
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
