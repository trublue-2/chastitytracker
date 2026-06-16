import { prisma } from "@/lib/prisma";
import {
  buildPairs, interruptionPauseMs, summarizeSessions, completedPairsFrom,
  calculateWearingHoursByRange, formatDateTime, isTimeCorrected, APP_TZ,
  type ReinigungSettings,
} from "@/lib/utils";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions, subVisibleKontrolleWhere } from "@/lib/queries";
import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { buildStrafbuch, type StrafbuchControlOffense } from "@/lib/strafbuch";

/** Read-only overview snapshot for the MCP `get_overview` tool.
 *  Timestamps are human strings in the instance timezone (see `timezone`) — NOT UTC,
 *  so a consuming LLM reads wall-clock time directly. Durations are hours (1 decimal). */
/** Period training-goal targets with progress percentages. Shared by KG + per-category goals. */
export interface GoalProgress {
  minPerDayH: number | null; todayPct: number | null;
  minPerWeekH: number | null; weekPct: number | null;
  minPerMonthH: number | null; monthPct: number | null;
}

export interface TrackerOverview {
  schemaVersion: 1;
  user: string;
  generatedAt: string;
  timezone: string;
  /** Free-text rules the human keyholder set for the AI keyholder. Write tools MUST respect these (soft guidance). */
  keyholderInstructions: string | null;
  lock: {
    isLocked: boolean;
    since: string | null;
    currentDurationHours: number | null;
    deviceName: string | null;
  };
  wearingHoursKg: { today: number; week: number; month: number };
  trainingGoalKg: (GoalProgress & { note: string | null }) | null;
  /** Cleaning-pause rules. maxPausesPerDay = max cleaning OPENINGS per day (a COUNT, not minutes;
   *  null = unlimited). maxMinutesPerBreak = max minutes per single pause. */
  reinigung: { allowed: boolean; maxMinutesPerBreak: number; maxPausesPerDay: number | null };
  /** Non-KG tracking categories (Plug, Collar, …) — wearing hours + their training goal (null if none). */
  categories: {
    name: string;
    wearingHours: { today: number; week: number; month: number };
    goal: GoalProgress | null;
  }[];
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
  /** Jüngste private Keyholder-Notizen (Beobachtungen zum Trageverhalten je KG/Kategorie).
   *  Volle Historie über list_keyholder_notes. Nur über den MCP sichtbar. */
  keyholderNotes: { id: string; kg: string | null; kategorie: string | null; text: string; at: string }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const msToHours = (ms: number) => round1(ms / 3_600_000);
const pct = (actual: number, target: number | null) =>
  target && target > 0 ? Math.round((actual / target) * 100) : null;

/** Builds the shared 6-field goal-progress shape from actual hours + period targets. */
const goalProgress = (
  tagH: number, wocheH: number, monatH: number,
  dayH: number | null, weekH: number | null, monthH: number | null,
): GoalProgress => ({
  minPerDayH: dayH, todayPct: pct(tagH, dayH),
  minPerWeekH: weekH, weekPct: pct(wocheH, weekH),
  minPerMonthH: monthH, monthPct: pct(monatH, monthH),
});

/** Resolves a username to its id and Reinigung settings. Throws if the user does not exist. */
async function loadUserContext(username: string): Promise<{ userId: string; reinigung: ReinigungSettings; reinigungMaxProTag: number; keyholderInstructions: string | null }> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, mcpKeyholderInstructions: true },
  });
  if (!user) throw new Error(`User not found: ${username}`);
  return {
    userId: user.id,
    reinigung: { erlaubt: user.reinigungErlaubt ?? false, maxMinuten: user.reinigungMaxMinuten ?? 15 },
    reinigungMaxProTag: user.reinigungMaxProTag ?? 0,
    keyholderInstructions: user.mcpKeyholderInstructions ?? null,
  };
}

/** Builds the overview for a user identified by username. Throws if the user does not exist. */
export async function buildOverview(username: string): Promise<TrackerOverview> {
  const { userId, reinigung, reinigungMaxProTag, keyholderInstructions } = await loadUserContext(username);
  const now = new Date();
  const fmt = (d: Date) => formatDateTime(d);
  const minutesUntil = (d: Date) => Math.round((d.getTime() - now.getTime()) / 60_000);

  const [entries, openKontrolle, activeVorgabe, activeSperrzeit, openAnf, activeWear, punishedCount, recentNotes] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      include: { device: { select: { name: true, categoryId: true } } },
    }),
    prisma.kontrollAnforderung.findFirst({
      // geplante (noch nicht ausgelöste) Kontrollen sind auch im get_overview unsichtbar
      where: { userId, entryId: null, withdrawnAt: null, ...subVisibleKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
    }),
    getActiveVorgabe(userId, now),
    getActiveSperrzeit(userId),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    getActiveWearSessions(userId),
    prisma.strafeRecord.count({ where: { userId } }),
    prisma.keyholderNote.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  // Reuse the already-loaded entries for per-category wear hours (no second entries scan).
  const categoryGoals = await buildCategoryWearGoals(userId, now, entries);

  // ── Lock state ──
  const latest = entries.find((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN") ?? null;
  const isLocked = latest?.type === "VERSCHLUSS";

  const pairs = buildPairs(entries, [], reinigung);
  const activePair = pairs.find((p) => p.active) ?? null;
  const currentDurationHours = isLocked && activePair
    ? msToHours(now.getTime() - activePair.verschluss.startTime.getTime() - interruptionPauseMs(activePair.interruptions))
    : null;
  // Currently worn device = newest re-lock of the session (the lock following the last
  // REINIGUNG pause), falling back to the session-start lock. A device swap during a
  // cleaning pause does not change the session head, so reading activePair.verschluss
  // alone would report the pre-pause device.
  const currentLock = activePair
    ? (activePair.interruptions.at(-1)?.verschluss ?? activePair.verschluss)
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
    keyholderInstructions,
    lock: {
      isLocked,
      since: latest ? fmt(latest.startTime) : null,
      currentDurationHours,
      deviceName: isLocked ? (currentLock?.device?.name ?? null) : null,
    },
    wearingHoursKg: { today: round1(tagH), week: round1(wocheH), month: round1(monatH) },
    trainingGoalKg: activeVorgabe ? {
      ...goalProgress(tagH, wocheH, monatH, activeVorgabe.minProTagH, activeVorgabe.minProWocheH, activeVorgabe.minProMonatH),
      note: activeVorgabe.notiz,
    } : null,
    reinigung: {
      allowed: reinigung.erlaubt,
      maxMinutesPerBreak: reinigung.maxMinuten,
      maxPausesPerDay: reinigungMaxProTag > 0 ? reinigungMaxProTag : null,
    },
    categories: categoryGoals.map((c) => ({
      name: c.name,
      wearingHours: { today: round1(c.tagH), week: round1(c.wocheH), month: round1(c.monatH) },
      goal: hasAnyGoal(c) ? goalProgress(c.tagH, c.wocheH, c.monatH, c.goalDayH, c.goalWeekH, c.goalMonthH) : null,
    })),
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
    keyholderNotes: recentNotes.map((n) => ({
      id: n.id, kg: n.kg, kategorie: n.kategorie, text: n.text, at: fmt(n.createdAt),
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

/** One raw entry for the MCP `list_entries` tool — every field a consuming LLM needs
 *  to understand the full context. Timestamps are instance-timezone strings. Photos are
 *  surfaced as metadata only (auth-protected files cannot be fetched by an MCP client). */
export interface EntryRow {
  /** One of VALID_TYPES: VERSCHLUSS | OEFFNEN | PRUEFUNG | ORGASMUS | WEAR_BEGIN | WEAR_END */
  type: string;
  time: string;
  /** Free-text note / comment the user attached to the entry. */
  note: string | null;
  /** Opening reason for OEFFNEN entries (REINIGUNG | KEYHOLDER | NOTFALL | ANDERES). */
  oeffnenGrund: string | null;
  /** Orgasm type for ORGASMUS entries (e.g. "Orgasmus", "ruinierter Orgasmus", "feuchter Traum"). */
  orgasmusArt: string | null;
  kontrollCode: string | null;
  verifikationStatus: string | null;
  deviceName: string | null;
  hasImage: boolean;
  imageExifTime: string | null;
  /** True when the entered time differs from the creation time (back-/post-dated). */
  timeCorrected: boolean;
}

export interface EntryList {
  schemaVersion: 1;
  user: string;
  generatedAt: string;
  timezone: string;
  /** Total entries matching the filter, before the limit is applied. */
  totalCount: number;
  returnedCount: number;
  entries: EntryRow[];
}

export interface ListEntriesOptions {
  /** Filter by entry type (one of VALID_TYPES). Omit for all types. */
  type?: string;
  /** Max rows (default 50, clamped to 1..200). */
  limit?: number;
}

/** Lists raw entries with full per-entry detail, newest first. Throws if the user does not exist. */
export async function listEntries(username: string, opts: ListEntriesOptions = {}): Promise<EntryList> {
  const { userId } = await loadUserContext(username);
  const typeFilter = opts.type?.trim().toUpperCase();
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const where = { userId, ...(typeFilter ? { type: typeFilter } : {}) };

  const [totalCount, entries] = await Promise.all([
    prisma.entry.count({ where }),
    prisma.entry.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: limit,
      include: { device: { select: { name: true } } },
    }),
  ]);

  return {
    schemaVersion: 1 as const,
    user: username,
    generatedAt: formatDateTime(new Date()),
    timezone: APP_TZ,
    totalCount,
    returnedCount: entries.length,
    entries: entries.map((e) => ({
      type: e.type,
      time: formatDateTime(e.startTime),
      note: e.note,
      oeffnenGrund: e.oeffnenGrund,
      orgasmusArt: e.orgasmusArt,
      kontrollCode: e.kontrollCode,
      verifikationStatus: e.verifikationStatus,
      deviceName: e.device?.name ?? null,
      hasImage: !!e.imageUrl,
      imageExifTime: e.imageExifTime ? formatDateTime(e.imageExifTime) : null,
      timeCorrected: isTimeCorrected(e.startTime, e.createdAt),
    })),
  };
}

/** One device for the MCP `list_devices` tool — inventory metadata. */
export interface DeviceRow {
  name: string;
  category: string;
  isKg: boolean;
  purchasePrice: number | null;
  currency: string | null;
  archived: boolean;
  createdAt: string;
}

export interface DeviceList {
  schemaVersion: 1;
  devices: DeviceRow[];
}

/** Lists the user's devices (KG + non-KG categories), active first then archived. Throws if the user does not exist. */
export async function listDevices(username: string): Promise<DeviceList> {
  const { userId } = await loadUserContext(username);
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    include: { category: { select: { name: true, isBuiltIn: true } } },
  });
  return {
    schemaVersion: 1 as const,
    devices: devices.map((d) => ({
      name: d.name,
      category: d.category?.name ?? "—",
      isKg: d.category?.isBuiltIn ?? false,
      purchasePrice: d.purchasePrice,
      currency: d.currency,
      archived: d.archivedAt !== null,
      createdAt: formatDateTime(d.createdAt),
    })),
  };
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
  /** Lock entries where a different device than the Anforderung specified was worn. */
  wrongDeviceViolations: { time: string | null; note: string | null; deviceName: string | null; punished: boolean }[];
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
      sb.rejectedControls.length + sb.reinigungLimitViolations.length +
      sb.wrongDeviceViolations.length,
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
    wrongDeviceViolations: sb.wrongDeviceViolations.map((v) => ({
      time: v.startTime ? fmt(v.startTime) : null,
      note: v.note,
      deviceName: v.deviceName,
      punished: punished.has(v.entryId),
    })),
  };
}

export interface ListNotesOptions { kg?: string; kategorie?: string; limit?: number }

/** Volle Keyholder-Notiz-Historie (Beobachtungen zum Trageverhalten), optional nach KG/Kategorie
 *  gefiltert. Read-only Gegenstück zu add/delete; get_overview zeigt nur die jüngsten 8. */
export async function listKeyholderNotes(username: string, opts: ListNotesOptions = {}) {
  const { userId } = await loadUserContext(username);
  const fmt = (d: Date) => formatDateTime(d);
  const notes = await prisma.keyholderNote.findMany({
    where: { userId, ...(opts.kg ? { kg: opts.kg } : {}), ...(opts.kategorie ? { kategorie: opts.kategorie } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return {
    schemaVersion: 1 as const,
    user: username,
    notes: notes.map((n) => ({ id: n.id, kg: n.kg, kategorie: n.kategorie, text: n.text, at: fmt(n.createdAt) })),
  };
}
