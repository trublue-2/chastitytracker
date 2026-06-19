import { prisma } from "@/lib/prisma";
import { getUserDeviceOptions } from "@/lib/queries";
import { createVerschlussAnforderung, updateSperrzeitEnde } from "@/lib/verschlussAnforderungService";
import { requestKontrolle, resolveKontrolle } from "@/lib/kontrolleService";
import { createVorgabe, updateVorgabe, deleteVorgabe, listVorgaben } from "@/lib/vorgabeService";
import { setReinigungSettings } from "@/lib/reinigungService";
import { createOrgasmusAnforderung, withdrawOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { judgeOffense } from "@/lib/strafurteilService";
import type { ServiceResult } from "@/lib/serviceResult";

/**
 * MCP write tools — keyholder directives issued over the MCP. The acting authority is the
 * OAuth-authorizing admin (verified via checkMcpKeyholder); the target is always MCP_USERNAME.
 * Each function reuses the same service layer as the admin UI, so behaviour + notifications match.
 */

/** Checks whether the OAuth-authorizing user may write (must be an existing admin/keyholder).
 *  Returns a precise reason on denial so the agent can self-diagnose instead of seeing a generic
 *  refusal. Single-instance model: any admin may direct MCP_USERNAME (mirrors requireAdminApi's
 *  blanket-admin behaviour); USE_ADMIN_RELATIONSHIPS scoping is not applied here. */
export async function checkMcpKeyholder(userId: string | undefined): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!userId) {
    return { ok: false, reason: "the token carries no user identity — the static MCP token is read-only; connect with an OAuth token authorized by an admin account" };
  }
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, role: true } });
  if (!u) return { ok: false, reason: "the token's user no longer exists" };
  if (u.role !== "admin") {
    return { ok: false, reason: `authorized as "${u.username}" (role: ${u.role}) — writing requires an admin (keyholder) account; reconnect the MCP and authorize while logged in as the admin` };
  }
  return { ok: true };
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
  delayMinutes?: number;
}
export async function mcpRequestInspection(username: string, args: RequestInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  // Delay-Policy (nur MCP): kein Wert → zufällig 5–65; ≤0 → sofort; sonst auf 5–65 geklemmt.
  let delayMinutes: number;
  if (args.delayMinutes === undefined) {
    delayMinutes = 5 + Math.floor(Math.random() * 61); // 5..65 inkl.
  } else if (args.delayMinutes <= 0) {
    delayMinutes = 0;
  } else {
    delayMinutes = Math.min(65, Math.max(5, Math.round(args.delayMinutes)));
  }

  const data = unwrap(await requestKontrolle({ userId, kommentar: args.comment, deadlineH: args.deadlineHours, delayMinutes }));

  if (data.scheduledFor) {
    return {
      ok: true,
      scheduledFor: data.scheduledFor,
      deadline: data.deadline,
      message: `Inspection scheduled — the code will reach the user in ~${delayMinutes} min (at ${data.scheduledFor}); the deadline then runs to ${data.deadline}. The user cannot see it until it triggers.`,
    };
  }
  return { ok: true, deadline: data.deadline, message: `Inspection requested immediately; the code was e-mailed to the user. Deadline: ${data.deadline}.` };
}

export interface RequestOrgasmArgs {
  art: "ANWEISUNG" | "GELEGENHEIT";
  /** Window start (ISO). Default: now. */
  beginsAt?: string;
  /** Window end (ISO). Takes precedence over windowHours. */
  endsAt?: string;
  /** Window length in hours from beginsAt, used when endsAt is absent. */
  windowHours?: number;
  /** Required orgasm type (one of ORGASMUS_ARTEN). Omit = any orgasm counts. */
  requiredType?: string;
  /** Allow opening the device to perform the orgasm during the window (no Sperre break / penalty). */
  openAllowed?: boolean;
  message?: string;
}
export async function mcpRequestOrgasm(username: string, args: RequestOrgasmArgs) {
  const userId = await resolveTargetUserId(username);
  const beginnt = args.beginsAt ? parseGoalDate(args.beginsAt, "beginsAt") : new Date();
  let endet: Date;
  if (args.endsAt) {
    endet = parseGoalDate(args.endsAt, "endsAt");
  } else if (args.windowHours && args.windowHours > 0) {
    endet = new Date(beginnt.getTime() + args.windowHours * 60 * 60 * 1000);
  } else {
    throw new Error("Provide endsAt (ISO date) or windowHours (> 0).");
  }
  const data = unwrap(await createOrgasmusAnforderung({
    userId,
    art: args.art,
    nachricht: args.message,
    beginntAt: beginnt,
    endetAt: endet,
    vorgegebeneArt: args.requiredType,
    oeffnenErlaubt: args.openAllowed,
  }));
  const kind = args.art === "ANWEISUNG" ? "mandatory directive" : "opportunity";
  return {
    ok: true,
    id: data.id,
    message: `Orgasm ${kind} set (window ${beginnt.toISOString()} – ${endet.toISOString()}); the user was notified by e-mail + push.`,
  };
}

export interface SetTrainingGoalArgs {
  category?: string;
  minPerDayHours?: number;
  minPerWeekHours?: number;
  minPerMonthHours?: number;
  validFrom?: string;
  validUntil?: string;
  note?: string;
}

/** Parses an ISO date arg, throwing a clean tool error on garbage. */
function parseGoalDate(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${field} date: "${value}". Use ISO 8601, e.g. 2026-06-12.`);
  }
  return d;
}

export async function mcpSetTrainingGoal(username: string, args: SetTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  const categoryId = args.category ? await resolveCategoryId(userId, args.category) : null;

  // Default to now; validFrom may be a future date to schedule a goal in advance.
  const gueltigAb = args.validFrom ? parseGoalDate(args.validFrom, "validFrom") : new Date();
  const gueltigBis = args.validUntil ? parseGoalDate(args.validUntil, "validUntil") : null;
  if (gueltigBis && gueltigBis.getTime() <= gueltigAb.getTime()) {
    throw new Error("validUntil must be after validFrom.");
  }

  const data = unwrap(await createVorgabe({
    userId,
    categoryId,
    gueltigAb,
    gueltigBis,
    minProTagH: args.minPerDayHours,
    minProWocheH: args.minPerWeekHours,
    minProMonatH: args.minPerMonthHours,
    notiz: args.note,
  }));
  const when = args.validFrom ? `scheduled from ${gueltigAb.toISOString().slice(0, 10)}` : "active now";
  return { ok: true, id: data.id, message: `Training goal set (${when}).` };
}

export interface WithdrawArgs {
  target: "lock_request" | "lock_period" | "inspection" | "orgasm_directive";
}
export async function mcpWithdraw(username: string, args: WithdrawArgs) {
  const userId = await resolveTargetUserId(username);
  const now = new Date();
  let count = 0;
  if (args.target === "orgasm_directive") {
    count = unwrap(await withdrawOrgasmusAnforderung(userId)).count;
  } else if (args.target === "lock_request") {
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

// ── Training goals: list / edit / delete ────────────────────────────────────

/** Loads a training goal and asserts it belongs to `userId` (scopes id-based tools to the target). */
async function assertOwnedVorgabe(id: string, userId: string): Promise<void> {
  const v = await prisma.trainingVorgabe.findUnique({ where: { id }, select: { userId: true } });
  if (!v || v.userId !== userId) throw new Error(`Training goal not found: ${id}`);
}

export interface ListTrainingGoalsArgs {
  category?: string;
}
export async function mcpListTrainingGoals(username: string, args: ListTrainingGoalsArgs) {
  const userId = await resolveTargetUserId(username);
  const filterCatId = args.category ? await resolveCategoryId(userId, args.category) : undefined;
  const now = Date.now();
  const goals = (await listVorgaben(userId))
    .filter((g) => filterCatId === undefined || g.categoryId === filterCatId)
    .map((g) => {
      const ab = g.gueltigAb.getTime();
      const bis = g.gueltigBis ? g.gueltigBis.getTime() : null;
      const status = ab > now ? "scheduled" : bis !== null && bis <= now ? "expired" : "active";
      return {
        id: g.id,
        category: g.category?.name ?? "KG",
        status,
        validFrom: g.gueltigAb.toISOString(),
        validUntil: g.gueltigBis ? g.gueltigBis.toISOString() : null,
        minPerDayHours: g.minProTagH,
        minPerWeekHours: g.minProWocheH,
        minPerMonthHours: g.minProMonatH,
        note: g.notiz,
      };
    });
  return { ok: true, goals };
}

export interface EditTrainingGoalArgs extends SetTrainingGoalArgs {
  id: string;
}
export async function mcpEditTrainingGoal(username: string, args: EditTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  await assertOwnedVorgabe(args.id, userId);

  // Category: only change when provided (omit = keep existing).
  const categoryId = args.category !== undefined ? await resolveCategoryId(userId, args.category) : undefined;
  const gueltigAb = args.validFrom ? parseGoalDate(args.validFrom, "validFrom") : new Date();
  const gueltigBis = args.validUntil ? parseGoalDate(args.validUntil, "validUntil") : null;
  if (gueltigBis && gueltigBis.getTime() <= gueltigAb.getTime()) {
    throw new Error("validUntil must be after validFrom.");
  }

  unwrap(await updateVorgabe(args.id, {
    categoryId,
    gueltigAb,
    gueltigBis,
    minProTagH: args.minPerDayHours,
    minProWocheH: args.minPerWeekHours,
    minProMonatH: args.minPerMonthHours,
    notiz: args.note,
  }));
  return { ok: true, id: args.id, message: "Training goal updated." };
}

export interface DeleteTrainingGoalArgs {
  id: string;
}
export async function mcpDeleteTrainingGoal(username: string, args: DeleteTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  await assertOwnedVorgabe(args.id, userId);
  unwrap(await deleteVorgabe(args.id));
  return { ok: true, id: args.id, message: "Training goal deleted." };
}

// ── Cleaning (Reinigung) settings ───────────────────────────────────────────

export interface SetCleaningArgs {
  allowed?: boolean;
  maxMinutes?: number;
  maxPerDay?: number;
}
export async function mcpSetCleaning(username: string, args: SetCleaningArgs) {
  const userId = await resolveTargetUserId(username);
  if (args.allowed === undefined && args.maxMinutes === undefined && args.maxPerDay === undefined) {
    throw new Error("Provide at least one of: allowed, maxMinutes, maxPerDay.");
  }
  unwrap(await setReinigungSettings(userId, {
    erlaubt: args.allowed,
    maxMinuten: args.maxMinutes,
    maxProTag: args.maxPerDay,
  }));
  return { ok: true, message: "Cleaning settings updated." };
}

// ── Inspections: verify / reject the latest submission ──────────────────────

export interface ResolveInspectionArgs {
  action: "verify" | "reject";
}
export async function mcpResolveInspection(username: string, args: ResolveInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  const ka = await prisma.kontrollAnforderung.findFirst({
    where: { userId, entryId: { not: null }, withdrawnAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!ka) throw new Error("No submitted inspection to verify or reject.");
  unwrap(await resolveKontrolle(ka.id, args.action === "verify" ? "manuallyVerify" : "reject"));
  return { ok: true, message: `Latest inspection ${args.action === "verify" ? "verified" : "rejected"}.` };
}

// ── Lock period: change the end of an active Sperrzeit ───────────────────────

export interface EditLockPeriodArgs {
  untilAt?: string;
  indefinite?: boolean;
}
export async function mcpEditLockPeriod(username: string, args: EditLockPeriodArgs) {
  const userId = await resolveTargetUserId(username);
  if (!args.indefinite && !args.untilAt) throw new Error("Provide untilAt (ISO date) or indefinite=true.");
  const endetAt = args.indefinite ? null : parseGoalDate(args.untilAt!, "untilAt");

  const now = new Date();
  const sz = await prisma.verschlussAnforderung.findFirst({
    where: { userId, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: null }, { endetAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!sz) throw new Error("No active lock period to edit.");
  unwrap(await updateSperrzeitEnde(sz.id, endetAt));
  return { ok: true, id: sz.id, message: args.indefinite ? "Lock period set to indefinite." : `Lock period end changed to ${endetAt!.toISOString()}.` };
}

// ── Urteil über ein erkanntes Vergehen (Strafbuch-Loop) ─────────────────────

export interface JudgeOffenseArgs {
  /** Vergehens-ref aus get_strafbuch (das Feld `ref.id`). */
  ref: string;
  action: "dismiss" | "punish" | "complete" | "reopen";
  /** Freitext: die Strafe (bei punish, erforderlich — z.B. „20 Schläge") bzw. ein Grund (bei dismiss). */
  text?: string;
}
export async function mcpJudgeOffense(username: string, args: JudgeOffenseArgs) {
  const userId = await resolveTargetUserId(username);
  const r = unwrap(await judgeOffense({
    userId,
    refId: args.ref,
    action: args.action,
    text: args.text,
    judgedBy: "ai",
  }));
  const message =
    args.action === "complete" ? "Penalty marked as completed."
    : r.status === "dismissed" ? "Offense dismissed (no penalty)."
    : r.status === "open" ? "Judgment reopened — the offense is open again."
    : "Offense punished — the penalty was recorded.";
  return { ok: true, status: r.status, done: r.done, message };
}

// ── Keyholder-Notizen — private Beobachtungen der KI zum Trageverhalten (nur MCP) ──

export interface AddKeyholderNoteArgs { text: string; kg?: string; kategorie?: string }

/** Legt eine freie Beobachtung zum MCP_USERNAME-User ab (Trageverhalten je KG/Kategorie). */
export async function mcpAddKeyholderNote(username: string, args: AddKeyholderNoteArgs) {
  const userId = await resolveTargetUserId(username);
  const text = args.text?.trim();
  if (!text) throw new Error("text is required.");
  const note = await prisma.keyholderNote.create({
    data: { userId, text, kg: args.kg?.trim() || null, kategorie: args.kategorie?.trim() || null },
  });
  return { ok: true, id: note.id, message: "Note saved." };
}

/** Löscht eine eigene Notiz (per id, auf MCP_USERNAME beschränkt) — z.B. veraltete Beobachtung. */
export async function mcpDeleteKeyholderNote(username: string, args: { id: string }) {
  const userId = await resolveTargetUserId(username);
  const res = await prisma.keyholderNote.deleteMany({ where: { id: args.id, userId } });
  if (res.count === 0) throw new Error(`Note not found: ${args.id}`);
  return { ok: true, message: "Note deleted." };
}
