import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

// ── Shared types ────────────────────────────────────────────────────────────

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

/** Returns true if the user is currently locked (latest VERSCHLUSS/OEFFNEN entry is VERSCHLUSS). */
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
  tx?: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
) {
  const client = tx ?? prisma;
  const device = await client.device.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== userId || device.archivedAt) return null;
  return device;
}

/**
 * Withdraws all active SPERRZEIT periods for a user when they open their device.
 * Exception: a cleaning opening is not considered a violation if both (a) the user
 * has cleaning allowed and (b) every active Sperrzeit has reinigungErlaubt=true.
 * Must be called inside a transaction — both user and admin entry routes rely on this.
 *
 * Returns true if any Sperrzeit was withdrawn (useful for notification routing).
 */
export async function withdrawActiveSperrzeitenOnOpen(
  userId: string,
  oeffnenGrund: string | null | undefined,
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
): Promise<boolean> {
  const now = new Date();
  const activeSperrzeiten = await tx.verschlussAnforderung.findMany({
    where: {
      userId,
      art: "SPERRZEIT",
      withdrawnAt: null,
      OR: [{ endetAt: { gt: now } }, { endetAt: null }],
    },
    select: { id: true, reinigungErlaubt: true },
  });
  if (activeSperrzeiten.length === 0) return false;

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { reinigungErlaubt: true },
  });
  const allowedCleaning =
    oeffnenGrund === "REINIGUNG" &&
    user?.reinigungErlaubt === true &&
    activeSperrzeiten.every((s) => s.reinigungErlaubt);
  if (allowedCleaning) return false;

  await tx.verschlussAnforderung.updateMany({
    where: { id: { in: activeSperrzeiten.map((s) => s.id) } },
    data: { withdrawnAt: now },
  });
  return true;
}
