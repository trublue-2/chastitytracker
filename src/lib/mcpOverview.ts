import { prisma } from "@/lib/prisma";
import {
  buildPairs, interruptionPauseMs, summarizeSessions, completedPairsFrom,
  calculateWearingHoursByRange,
  type ReinigungSettings,
} from "@/lib/utils";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions } from "@/lib/queries";

/** Read-only overview snapshot for the MCP `get_overview` tool.
 *  All times ISO strings, all durations in hours (1 decimal) — LLM-friendly. */
export interface TrackerOverview {
  user: string;
  generatedAt: string;
  lock: {
    isLocked: boolean;
    since: string | null;
    currentDurationHours: number | null;
    deviceName: string | null;
  };
  wearingHoursKg: { today: number; week: number; month: number };
  trainingGoalKg: {
    minProTagH: number | null; todayPct: number | null;
    minProWocheH: number | null; weekPct: number | null;
    minProMonatH: number | null; monthPct: number | null;
    notiz: string | null;
  } | null;
  openKontrolle: { code: string; deadline: string; overdue: boolean; kommentar: string | null } | null;
  activeSperrzeit: { endetAt: string | null; indefinite: boolean; nachricht: string | null } | null;
  openVerschlussAnforderung: { endetAt: string | null; overdue: boolean; nachricht: string | null; dauerH: number | null } | null;
  sessionSummary: {
    totalSessions: number; totalHours: number; avgHours: number;
    longestHours: number; shortestHours: number;
    lastOrgasmAt: string | null; orgasmFreeHours: number | null;
  } | null;
  penalties: { recordedCount: number };
  activeWearSessions: { category: string; deviceName: string; since: string; durationHours: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const msToHours = (ms: number) => round1(ms / 3_600_000);
const pct = (actual: number, target: number | null) =>
  target && target > 0 ? Math.round((actual / target) * 100) : null;

/** Builds the overview for a user identified by username. Throws if the user does not exist. */
export async function buildOverview(username: string): Promise<TrackerOverview> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, reinigungErlaubt: true, reinigungMaxMinuten: true },
  });
  if (!user) throw new Error(`User not found: ${username}`);

  const userId = user.id;
  const now = new Date();
  const reinigung: ReinigungSettings = {
    erlaubt: user.reinigungErlaubt ?? false,
    maxMinuten: user.reinigungMaxMinuten ?? 15,
  };

  const [entries, openKontrolle, activeVorgabe, activeSperrzeit, openAnf, activeWear, penaltyCount] = await Promise.all([
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
    user: username,
    generatedAt: now.toISOString(),
    lock: {
      isLocked,
      since: latest?.startTime.toISOString() ?? null,
      currentDurationHours,
      deviceName: isLocked ? (activePair?.verschluss.device?.name ?? null) : null,
    },
    wearingHoursKg: { today: round1(tagH), week: round1(wocheH), month: round1(monatH) },
    trainingGoalKg: activeVorgabe ? {
      minProTagH: activeVorgabe.minProTagH,
      todayPct: pct(tagH, activeVorgabe.minProTagH),
      minProWocheH: activeVorgabe.minProWocheH,
      weekPct: pct(wocheH, activeVorgabe.minProWocheH),
      minProMonatH: activeVorgabe.minProMonatH,
      monthPct: pct(monatH, activeVorgabe.minProMonatH),
      notiz: activeVorgabe.notiz,
    } : null,
    openKontrolle: openKontrolle ? {
      code: openKontrolle.code,
      deadline: openKontrolle.deadline.toISOString(),
      overdue: openKontrolle.deadline < now,
      kommentar: openKontrolle.kommentar,
    } : null,
    activeSperrzeit: activeSperrzeit ? {
      endetAt: activeSperrzeit.endetAt?.toISOString() ?? null,
      indefinite: activeSperrzeit.endetAt === null,
      nachricht: activeSperrzeit.nachricht,
    } : null,
    openVerschlussAnforderung: openAnf ? {
      endetAt: openAnf.endetAt?.toISOString() ?? null,
      overdue: openAnf.endetAt ? openAnf.endetAt < now : false,
      nachricht: openAnf.nachricht,
      dauerH: openAnf.dauerH,
    } : null,
    sessionSummary: summary.count > 0 ? {
      totalSessions: summary.count,
      totalHours: msToHours(summary.totalMs),
      avgHours: msToHours(summary.avgMs),
      longestHours: msToHours(summary.longest?.durationMs ?? 0),
      shortestHours: msToHours(summary.shortest?.durationMs ?? 0),
      lastOrgasmAt: lastOrgasmus?.startTime.toISOString() ?? null,
      orgasmFreeHours: lastOrgasmus ? msToHours(now.getTime() - lastOrgasmus.startTime.getTime()) : null,
    } : null,
    penalties: { recordedCount: penaltyCount },
    activeWearSessions: activeWear.map((s) => ({
      category: s.categoryName,
      deviceName: s.deviceName,
      since: s.since.toISOString(),
      durationHours: msToHours(now.getTime() - s.since.getTime()),
    })),
  };
}
