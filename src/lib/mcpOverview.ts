import { prisma } from "@/lib/prisma";
import {
  buildPairs, interruptionPauseMs, summarizeSessions, completedPairsFrom,
  calculateWearingHoursByRange, formatDateTime, APP_TZ,
  type ReinigungSettings,
} from "@/lib/utils";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions } from "@/lib/queries";
import { buildStrafbuch, type StrafbuchControlOffense } from "@/lib/strafbuch";

/** Read-only overview snapshot for the MCP `get_overview` tool.
 *  Timestamps are human strings in the instance timezone (see `timezone`) — NOT UTC,
 *  so a consuming LLM reads wall-clock time directly. Durations are hours (1 decimal). */
export interface TrackerOverview {
  schemaVersion: 1;
  user: string;
  generatedAt: string;
  timezone: string;
  lock: {
    isLocked: boolean;
    since: string | null;
    currentDurationHours: number | null;
    deviceName: string | null;
  };
  wearingHoursKg: { today: number; week: number; month: number };
  trainingGoalKg: {
    minPerDayH: number | null; todayPct: number | null;
    minPerWeekH: number | null; weekPct: number | null;
    minPerMonthH: number | null; monthPct: number | null;
    note: string | null;
  } | null;
  openKontrolle: { code: string; deadline: string; overdue: boolean; remainingMinutes: number; comment: string | null } | null;
  activeSperrzeit: { endetAt: string | null; indefinite: boolean; remainingMinutes: number | null; message: string | null } | null;
  openVerschlussAnforderung: { endetAt: string | null; overdue: boolean; remainingMinutes: number | null; message: string | null; dauerH: number | null } | null;
  sessionSummary: {
    totalSessions: number; totalHours: number; avgHours: number;
    longestHours: number; shortestHours: number;
    lastOrgasmAt: string | null; orgasmFreeHours: number | null;
  } | null;
  /** punishedCount: admin-confirmed punishments (StrafeRecord rows).
   *  Distinct from detectedOffenseCount in get_strafbuch which counts system-detected offenses. */
  penalties: { punishedCount: number };
  activeWearSessions: { category: string; deviceName: string; since: string; durationHours: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const msToHours = (ms: number) => round1(ms / 3_600_000);
const pct = (actual: number, target: number | null) =>
  target && target > 0 ? Math.round((actual / target) * 100) : null;

/** Resolves a username to its id and Reinigung settings. Throws if the user does not exist. */
async function loadUserContext(username: string): Promise<{ userId: string; reinigung: ReinigungSettings }> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, reinigungErlaubt: true, reinigungMaxMinuten: true },
  });
  if (!user) throw new Error(`User not found: ${username}`);
  return {
    userId: user.id,
    reinigung: { erlaubt: user.reinigungErlaubt ?? false, maxMinuten: user.reinigungMaxMinuten ?? 15 },
  };
}

/** Builds the overview for a user identified by username. Throws if the user does not exist. */
export async function buildOverview(username: string): Promise<TrackerOverview> {
  const { userId, reinigung } = await loadUserContext(username);
  const now = new Date();
  const fmt = (d: Date) => formatDateTime(d);
  const minutesUntil = (d: Date) => Math.round((d.getTime() - now.getTime()) / 60_000);

  const [entries, openKontrolle, activeVorgabe, activeSperrzeit, openAnf, activeWear, punishedCount] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      include: { device: { select: { name: true, categoryId: true } } },
    }),
    prisma.kontrollAnforderung.findFirst({
      where: { userId, entryId: null, withdrawnAt: null },
      orderBy: { createdAt: "desc" },
    }),
    getActiveVorgabe(userId, now),
    getActiveSperrzeit(userId),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    getActiveWearSessions(userId),
    prisma.strafeRecord.count({ where: { userId } }),
  ]);

  // ── Lock state ──
  const latest = entries.find((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN") ?? null;
  const isLocked = latest?.type === "VERSCHLUSS";

  const pairs = buildPairs(entries, [], reinigung);
  const activePair = pairs.find((p) => p.active) ?? null;
  const currentDurationHours = isLocked && activePair
    ? msToHours(now.getTime() - activePair.verschluss.startTime.getTime() - interruptionPauseMs(activePair.interruptions))
    : null;

  // ── Completed sessions ──
  const summary = summarizeSessions(completedPairsFrom(pairs));

  const lastOrgasmus = entries.find((e) => e.type === "ORGASMUS") ?? null;

  // ── Wearing hours + KG training goal ──
  const { tagH, wocheH, monatH } = calculateWearingHoursByRange(entries, now, reinigung);

  return {
    schemaVersion: 1 as const,
    user: username,
    generatedAt: fmt(now),
    timezone: APP_TZ,
    lock: {
      isLocked,
      since: latest ? fmt(latest.startTime) : null,
      currentDurationHours,
      deviceName: isLocked ? (activePair?.verschluss.device?.name ?? null) : null,
    },
    wearingHoursKg: { today: round1(tagH), week: round1(wocheH), month: round1(monatH) },
    trainingGoalKg: activeVorgabe ? {
      minPerDayH: activeVorgabe.minProTagH,
      todayPct: pct(tagH, activeVorgabe.minProTagH),
      minPerWeekH: activeVorgabe.minProWocheH,
      weekPct: pct(wocheH, activeVorgabe.minProWocheH),
      minPerMonthH: activeVorgabe.minProMonatH,
      monthPct: pct(monatH, activeVorgabe.minProMonatH),
      note: activeVorgabe.notiz,
    } : null,
    openKontrolle: openKontrolle ? {
      code: openKontrolle.code,
      deadline: fmt(openKontrolle.deadline),
      overdue: openKontrolle.deadline < now,
      remainingMinutes: minutesUntil(openKontrolle.deadline),
      comment: openKontrolle.kommentar,
    } : null,
    activeSperrzeit: activeSperrzeit ? {
      endetAt: activeSperrzeit.endetAt ? fmt(activeSperrzeit.endetAt) : null,
      indefinite: activeSperrzeit.endetAt === null,
      remainingMinutes: activeSperrzeit.endetAt ? minutesUntil(activeSperrzeit.endetAt) : null,
      message: activeSperrzeit.nachricht,
    } : null,
    openVerschlussAnforderung: openAnf ? {
      endetAt: openAnf.endetAt ? fmt(openAnf.endetAt) : null,
      overdue: openAnf.endetAt ? openAnf.endetAt < now : false,
      remainingMinutes: openAnf.endetAt ? minutesUntil(openAnf.endetAt) : null,
      message: openAnf.nachricht,
      dauerH: openAnf.dauerH,
    } : null,
    sessionSummary: summary.count > 0 ? {
      totalSessions: summary.count,
      totalHours: msToHours(summary.totalMs),
      avgHours: msToHours(summary.avgMs),
      longestHours: msToHours(summary.longest?.durationMs ?? 0),
      shortestHours: msToHours(summary.shortest?.durationMs ?? 0),
      lastOrgasmAt: lastOrgasmus ? fmt(lastOrgasmus.startTime) : null,
      orgasmFreeHours: lastOrgasmus ? msToHours(now.getTime() - lastOrgasmus.startTime.getTime()) : null,
    } : null,
    penalties: { punishedCount },
    activeWearSessions: activeWear.map((s) => ({
      category: s.categoryName,
      deviceName: s.deviceName,
      since: fmt(s.since),
      durationHours: msToHours(now.getTime() - s.since.getTime()),
    })),
  };
}

/** One completed session for the MCP `list_sessions` tool. */
export interface SessionRow {
  category: string;
  deviceName: string | null;
  start: string;
  end: string;
  durationHours: number;
}

export interface SessionList {
  schemaVersion: 1;
  sessions: SessionRow[];
}

export interface ListSessionsOptions {
  /** "KG" or a category name (case-insensitive). Omit for all categories. */
  category?: string;
  /** Max rows (default 20, clamped to 1..100). */
  limit?: number;
}

type RawSession = { category: string; deviceName: string | null; start: Date; end: Date; durationMs: number };

/** Pairs WEAR_BEGIN→WEAR_END entries of one category, keeping the device name and
 *  yielding completed sessions only. `buildWearPairs` is not reused here because it
 *  deliberately drops the device and includes the still-open session. */
function completedWearSessions(
  entries: { type: string; startTime: Date; device?: { name?: string | null; categoryId?: string | null } | null }[],
  categoryId: string,
  categoryName: string,
): RawSession[] {
  const asc = entries
    .filter((e) => (e.type === "WEAR_BEGIN" || e.type === "WEAR_END") && e.device?.categoryId === categoryId)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const out: RawSession[] = [];
  let pending: typeof asc[number] | null = null;
  for (const e of asc) {
    if (e.type === "WEAR_BEGIN") pending = e;
    else if (e.type === "WEAR_END" && pending) {
      out.push({
        category: categoryName,
        deviceName: pending.device?.name ?? null,
        start: pending.startTime,
        end: e.startTime,
        durationMs: e.startTime.getTime() - pending.startTime.getTime(),
      });
      pending = null;
    }
  }
  return out;
}

/** Lists completed sessions (KG + non-KG wear), newest first. Throws if the user does not exist. */
export async function listSessions(username: string, opts: ListSessionsOptions = {}): Promise<SessionList> {
  const { userId, reinigung } = await loadUserContext(username);

  const [entries, nonKgCategories] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      include: { device: { select: { name: true, categoryId: true } } },
    }),
    // All non-KG categories — including tracking-disabled ones, since their past sessions still count.
    prisma.deviceCategory.findMany({ where: { userId, isBuiltIn: false }, select: { id: true, name: true } }),
  ]);

  // KG durationMs is interruption-adjusted (REINIGUNG pauses deducted) — keep that value.
  const kg: RawSession[] = completedPairsFrom(buildPairs(entries, [], reinigung)).map((p) => ({
    category: "KG",
    deviceName: p.verschluss.device?.name ?? null,
    start: p.verschluss.startTime,
    end: p.oeffnen.startTime,
    durationMs: p.durationMs,
  }));
  const wear = nonKgCategories.flatMap((c) => completedWearSessions(entries, c.id, c.name));

  const filter = opts.category?.trim().toLowerCase();
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);

  const sessions = [...kg, ...wear]
    .filter((s) => s.durationMs > 0)
    .filter((s) => !filter || s.category.toLowerCase() === filter)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, limit)
    .map((s) => ({
      category: s.category,
      deviceName: s.deviceName,
      start: formatDateTime(s.start),
      end: formatDateTime(s.end),
      durationHours: msToHours(s.durationMs),
    }));
  return { schemaVersion: 1 as const, sessions };
}

/** A Kontroll-based offense formatted for the MCP `get_strafbuch` tool. */
export interface StrafbuchControlRow {
  code: string;
  deadline: string;
  fulfilledAt: string | null;
  entryTime: string | null;
  backdated: boolean;
  comment: string | null;
  entryNote: string | null;
  punished: boolean;
}

/** Strafbuch snapshot for the MCP `get_strafbuch` tool. Timestamps in the instance timezone. */
export interface StrafbuchOverview {
  schemaVersion: 1;
  user: string;
  generatedAt: string;
  timezone: string;
  /** Total number of system-detected offenses across all categories.
   *  Distinct from penalties.punishedCount in get_overview which counts admin-confirmed punishments. */
  detectedOffenseCount: number;
  unauthorizedOpenings: {
    time: string; note: string | null;
    lockPeriodEndedAt: string | null; lockPeriodIndefinite: boolean;
    punished: boolean;
  }[];
  lateControls: StrafbuchControlRow[];
  rejectedControls: StrafbuchControlRow[];
  cleaningLimitViolations: { time: string | null; note: string | null; punished: boolean }[];
}

/** Builds the Strafbuch snapshot for the user. Throws if the user does not exist. */
export async function mcpStrafbuch(username: string): Promise<StrafbuchOverview> {
  const { userId } = await loadUserContext(username);
  const now = new Date();
  const fmt = (d: Date) => formatDateTime(d);
  const sb = await buildStrafbuch(userId, now);
  const punished = new Set(sb.strafeRecords.map((r) => r.refId));

  const toControlRow = (k: StrafbuchControlOffense): StrafbuchControlRow => ({
    code: k.code,
    deadline: fmt(k.deadline),
    fulfilledAt: k.fulfilledAt ? fmt(k.fulfilledAt) : null,
    entryTime: k.entryStartTime ? fmt(k.entryStartTime) : null,
    backdated: k.backdated,
    comment: k.kommentar,
    entryNote: k.entryNote,
    punished: punished.has(k.id),
  });

  return {
    schemaVersion: 1 as const,
    user: username,
    generatedAt: fmt(now),
    timezone: APP_TZ,
    detectedOffenseCount:
      sb.unauthorizedOpenings.length + sb.lateControls.length +
      sb.rejectedControls.length + sb.reinigungLimitViolations.length,
    unauthorizedOpenings: sb.unauthorizedOpenings.map((o) => ({
      time: fmt(o.startTime),
      note: o.note,
      lockPeriodEndedAt: o.sperrzeitEndetAt ? fmt(o.sperrzeitEndetAt) : null,
      lockPeriodIndefinite: o.sperrzeitIndefinite,
      punished: punished.has(o.id),
    })),
    lateControls: sb.lateControls.map(toControlRow),
    rejectedControls: sb.rejectedControls.map(toControlRow),
    cleaningLimitViolations: sb.reinigungLimitViolations.map((v) => ({
      time: v.startTime ? fmt(v.startTime) : null,
      note: v.note,
      punished: punished.has(v.entryId),
    })),
  };
}
