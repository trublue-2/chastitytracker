import { prisma } from "@/lib/prisma";
import { getUserDeviceOptions } from "@/lib/queries";
import { createVerschlussAnforderung } from "@/lib/verschlussAnforderungService";
import { requestKontrolle } from "@/lib/kontrolleService";
import { createVorgabe } from "@/lib/vorgabeService";
import type { ServiceResult } from "@/lib/serviceResult";

/**
 * MCP write tools — keyholder directives issued over the MCP. The acting authority is the
 * OAuth-authorizing admin (verified via isMcpKeyholder); the target is always MCP_USERNAME.
 * Each function reuses the same service layer as the admin UI, so behaviour + notifications match.
 */

/** True when the OAuth-authorizing user id belongs to an existing admin (keyholder). Gates writes.
 *  Single-instance model: any admin may direct MCP_USERNAME (mirrors requireAdminApi's blanket-admin
 *  behaviour). USE_ADMIN_RELATIONSHIPS scoping is not applied here. */
export async function isMcpKeyholder(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === "admin";
}

/** Resolves the configured MCP_USERNAME (the directive target) to its user id. Throws if missing. */
async function resolveTargetUserId(username: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!u) throw new Error(`User not found: ${username}`);
  return u.id;
}

/** Resolves a KG device name (case-insensitive) belonging to the user to its id. Throws if not found.
 *  Scoped to KG/built-in devices — the same set a VerschlussAnforderung (ANFORDERUNG) accepts. */
async function resolveDeviceId(userId: string, name: string): Promise<string> {
  const devices = await getUserDeviceOptions(userId);
  const match = devices.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());
  if (!match) throw new Error(`Device not found: "${name}". Available: ${devices.map((d) => d.name).join(", ") || "none"}`);
  return match.id;
}

/** Resolves a category name to its id ("KG"/built-in or a user category). Throws if not found. */
async function resolveCategoryId(userId: string, name: string): Promise<string> {
  const n = name.trim().toLowerCase();
  const cats = await prisma.deviceCategory.findMany({
    where: { userId },
    select: { id: true, name: true, isBuiltIn: true },
  });
  const match = (n === "kg")
    ? cats.find((c) => c.isBuiltIn)
    : cats.find((c) => c.name.toLowerCase() === n);
  if (!match) throw new Error(`Category not found: "${name}". Available: ${cats.map((c) => c.name).join(", ")}`);
  return match.id;
}

/** Unwraps a ServiceResult, throwing its error message so the tool wrapper surfaces it. */
function unwrap<T>(r: ServiceResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export interface RequestLockArgs {
  deadlineHours?: number;
  deadlineAt?: string;
  minDurationHours?: number;
  deviceName?: string;
  message?: string;
}
export async function mcpRequestLock(username: string, args: RequestLockArgs) {
  const userId = await resolveTargetUserId(username);
  const deviceId = args.deviceName ? await resolveDeviceId(userId, args.deviceName) : null;
  const data = unwrap(await createVerschlussAnforderung({
    userId,
    art: "ANFORDERUNG",
    nachricht: args.message,
    endetAt: args.deadlineAt,
    fristH: args.deadlineHours,
    dauerH: args.minDurationHours,
    deviceId,
  }));
  return { ok: true, id: data.id, message: "Lock request created; the user was notified by e-mail + push." };
}

export interface SetLockPeriodArgs {
  untilAt?: string;
  durationHours?: number;
  indefinite?: boolean;
  reinigungErlaubt?: boolean;
  message?: string;
}
export async function mcpSetLockPeriod(username: string, args: SetLockPeriodArgs) {
  const userId = await resolveTargetUserId(username);
  const data = unwrap(await createVerschlussAnforderung({
    userId,
    art: "SPERRZEIT",
    nachricht: args.message,
    endetAt: args.indefinite ? null : args.untilAt,
    fristH: args.indefinite ? null : args.durationHours,
    reinigungErlaubt: args.reinigungErlaubt,
  }));
  return { ok: true, id: data.id, message: "Lock period set; the user was notified by e-mail + push." };
}

export interface RequestInspectionArgs {
  deadlineHours?: number;
  comment?: string;
}
export async function mcpRequestInspection(username: string, args: RequestInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  const data = unwrap(await requestKontrolle({ userId, kommentar: args.comment, deadlineH: args.deadlineHours }));
  return { ok: true, deadline: data.deadline, message: `Inspection requested; the code was e-mailed to the user. Deadline: ${data.deadline}.` };
}

export interface SetTrainingGoalArgs {
  category?: string;
  minPerDayHours?: number;
  minPerWeekHours?: number;
  minPerMonthHours?: number;
  validUntil?: string;
  note?: string;
}
export async function mcpSetTrainingGoal(username: string, args: SetTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  const categoryId = args.category ? await resolveCategoryId(userId, args.category) : null;
  const data = unwrap(await createVorgabe({
    userId,
    categoryId,
    gueltigAb: new Date(),
    gueltigBis: args.validUntil,
    minProTagH: args.minPerDayHours,
    minProWocheH: args.minPerWeekHours,
    minProMonatH: args.minPerMonthHours,
    notiz: args.note,
  }));
  return { ok: true, id: data.id, message: "Training goal set." };
}

export interface WithdrawArgs {
  target: "lock_request" | "lock_period" | "inspection";
}
export async function mcpWithdraw(username: string, args: WithdrawArgs) {
  const userId = await resolveTargetUserId(username);
  const now = new Date();
  let count = 0;
  if (args.target === "lock_request") {
    count = (await prisma.verschlussAnforderung.updateMany({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
      data: { withdrawnAt: now },
    })).count;
  } else if (args.target === "lock_period") {
    count = (await prisma.verschlussAnforderung.updateMany({
      where: { userId, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: null }, { endetAt: { gt: now } }] },
      data: { withdrawnAt: now },
    })).count;
  } else if (args.target === "inspection") {
    count = (await prisma.kontrollAnforderung.updateMany({
      where: { userId, entryId: null, withdrawnAt: null },
      data: { withdrawnAt: now },
    })).count;
  } else {
    throw new Error(`Unknown withdraw target: ${args.target}`);
  }
  return { ok: true, withdrawn: count, message: count > 0 ? `Withdrew ${count} ${args.target}.` : `Nothing open to withdraw for ${args.target}.` };
}
