import { prisma } from "@/lib/prisma";
import {
  buildPairs, interruptionPauseMs, summarizeSessions, completedPairsFrom,
  calculateWearingHoursByRange, formatDateTime, isTimeCorrected, APP_TZ,
  type ReinigungSettings,
} from "@/lib/utils";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions, getActiveOrgasmusAnforderung, aktiveKontrolleWhere } from "@/lib/queries";
import { parseReinigungsFenster, aktivesReinigungsFenster, reinigungVerbrauchtHeute } from "@/lib/reinigungService";
import { autoKontrolleSettingsFromUser, type AutoKontrolleSettings } from "@/lib/autoKontrolleService";
import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { buildStrafbuch, type StrafbuchControlOffense } from "@/lib/strafbuch";
import { collectDetectedOffenses } from "@/lib/strafurteilService";

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
  /** Cleaning-pause rules.
   *  - windows: allowed daily TIME WINDOWS (HH:MM, CH local time). EMPTY = NOT time-bound (any time of day).
   *  - windowOpenNow: the currently open window (until = its end HH:MM), or null if outside all windows.
   *  - maxPausesPerDay = max cleaning OPENINGS per day (a COUNT, not minutes; null = unlimited).
   *  - usedToday = openings already used today (resets at CH midnight). maxMinutesPerBreak = max minutes per opening.
   *  A DEVICE CHANGE runs through this same cleaning path and consumes one opening. */
  reinigung: {
    allowed: boolean;
    windows: { start: string; end: string }[];
    windowOpenNow: { until: string } | null;
    maxMinutesPerBreak: number;
    maxPausesPerDay: number | null;
    usedToday: number;
  };
  /** Automatische Kontrollen: das System sendet selbsttätig `proTag` zufällig verteilte Kontrollen
   *  pro Tag (Frist nie im Schlaf-Fenster ruheVon–ruheBis, Erfüllungsdauer zufällig fristVon–fristBis
   *  Min). aktiv=false → keine Auto-Kontrollen. Geplante, noch nicht ausgelöste sind absichtlich
   *  unsichtbar (auch hier). */
  autoKontrolle: { aktiv: boolean; proTag: number; ruheVon: string; ruheBis: string; fristVon: number; fristBis: number };
  /** Non-KG tracking categories (Plug, Collar, …) — wearing hours + their training goal (null if none). */
  categories: {
    name: string;
    wearingHours: { today: number; week: number; month: number };
    goal: GoalProgress | null;
  }[];
  /** Aktuell OFFENE Kontrolle (noch nicht eingereicht). null bedeutet NICHT "ausgelaufen": eine
   *  eingereichte Kontrolle ist nicht mehr offen (→ lastKontrolle), eine überfällige bleibt offen
   *  mit overdue:true. Kontrollen verschwinden nie automatisch. */
  openKontrolle: { code: string; deadline: string; overdue: boolean; remainingMinutes: number; comment: string | null } | null;
  /** Die zuletzt eingereichte Kontrolle (jüngste PRUEFUNG) — Code-Verifikation + Geräte-Check.
   *  Damit ist erkennbar, dass/wann zuletzt etwas eingereicht & verifiziert wurde. null = nie. */
  lastKontrolle: {
    time: string;
    code: string | null;
    verifikationStatus: string | null;
    deviceCheck: { status: string; detected: string | null; expected: string | null } | null;
  } | null;
  /** reinigungErlaubt: true = eine Reinigungsöffnung bricht die Sperre nicht. deviceName: vorgegebenes Gerät (null = keines). */
  activeSperrzeit: { endetAt: string | null; indefinite: boolean; remainingMinutes: number | null; message: string | null; reinigungErlaubt: boolean; deviceName: string | null } | null;
  /** deviceName: das von der Anforderung verlangte Gerät (null = beliebig). reinigungErlaubt wird auf die erzeugte Sperrzeit vererbt. */
  openVerschlussAnforderung: { endetAt: string | null; overdue: boolean; remainingMinutes: number | null; message: string | null; dauerH: number | null; reinigungErlaubt: boolean; deviceName: string | null } | null;
  /** Open keyholder orgasm directive (request/opportunity) whose window has not yet ended. */
  openOrgasmusAnforderung: { art: string; beginntAt: string; endetAt: string; active: boolean; requiredType: string | null; message: string | null; remainingMinutes: number } | null;
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

/** Geräte-Check eines Eintrags ins MCP-Format (status/detected/expected) oder null. */
function mapDeviceCheck(e: { deviceCheck: string | null; deviceCheckNote: string | null; deviceCheckExpected: string | null }) {
  return e.deviceCheck ? { status: e.deviceCheck, detected: e.deviceCheckNote, expected: e.deviceCheckExpected } : null;
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
async function loadUserContext(username: string): Promise<{ userId: string; reinigung: ReinigungSettings; reinigungMaxProTag: number; reinigungsFensterRaw: unknown; keyholderInstructions: string | null; autoKontrolle: AutoKontrolleSettings }> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true, mcpKeyholderInstructions: true,
      autoKontrolleAktiv: true, autoKontrolleProTag: true, autoKontrolleRuheVon: true, autoKontrolleRuheBis: true, autoKontrolleFristVon: true, autoKontrolleFristBis: true,
    },
  });
  if (!user) throw new Error(`User not found: ${username}`);
  return {
    userId: user.id,
    reinigung: { erlaubt: user.reinigungErlaubt ?? false, maxMinuten: user.reinigungMaxMinuten ?? 15 },
    reinigungMaxProTag: user.reinigungMaxProTag ?? 0,
    reinigungsFensterRaw: user.reinigungsFenster,
    keyholderInstructions: user.mcpKeyholderInstructions ?? null,
    autoKontrolle: autoKontrolleSettingsFromUser(user),
  };
}

/** Builds the overview for a user identified by username. Throws if the user does not exist. */
export async function buildOverview(username: string): Promise<TrackerOverview> {
  const { userId, reinigung, reinigungMaxProTag, reinigungsFensterRaw, keyholderInstructions, autoKontrolle } = await loadUserContext(username);
  const now = new Date();
  const fmt = (d: Date) => formatDateTime(d);
  const minutesUntil = (d: Date) => Math.round((d.getTime() - now.getTime()) / 60_000);

  const [entries, openKontrolle, activeVorgabe, activeSperrzeit, openAnf, activeWear, punishedCount, recentNotes, openOrgasmusAnf, cleaningUsedToday] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      include: { device: { select: { name: true, categoryId: true } } },
    }),
    prisma.kontrollAnforderung.findFirst({
      // geplante (noch nicht ausgelöste) Kontrollen sind auch im get_overview unsichtbar
      where: { userId, entryId: null, withdrawnAt: null, ...aktiveKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
    }),
    getActiveVorgabe(userId, now),
    getActiveSperrzeit(userId),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
      include: { device: { select: { name: true } } },
    }),
    getActiveWearSessions(userId),
    prisma.strafeRecord.count({ where: { userId, status: "PUNISHED" } }),
    prisma.keyholderNote.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 }),
    getActiveOrgasmusAnforderung(userId, now),
    reinigungVerbrauchtHeute(userId, now),
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

  const cleaningWindowEnd = aktivesReinigungsFenster(reinigungsFensterRaw, now); // "HH:MM" oder null



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
      windows: parseReinigungsFenster(reinigungsFensterRaw),
      windowOpenNow: cleaningWindowEnd ? { until: cleaningWindowEnd } : null,
      maxMinutesPerBreak: reinigung.maxMinuten,
      maxPausesPerDay: reinigungMaxProTag > 0 ? reinigungMaxProTag : null,
      usedToday: cleaningUsedToday,
    },
    autoKontrolle: {
      aktiv: autoKontrolle.aktiv,
      proTag: autoKontrolle.proTag,
      ruheVon: autoKontrolle.ruheVon,
      ruheBis: autoKontrolle.ruheBis,
      fristVon: autoKontrolle.fristVon,
      fristBis: autoKontrolle.fristBis,
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
    lastKontrolle: (() => {
      // Jüngste eingereichte Kontrolle (PRUEFUNG) aus den bereits geladenen entries — kein Extra-Query.
      const p = entries.find((e) => e.type === "PRUEFUNG");
      return p ? {
        time: fmt(p.startTime),
        code: p.kontrollCode,
        verifikationStatus: p.verifikationStatus,
        deviceCheck: mapDeviceCheck(p),
      } : null;
    })(),
    activeSperrzeit: activeSperrzeit ? {
      endetAt: activeSperrzeit.endetAt ? fmt(activeSperrzeit.endetAt) : null,
      indefinite: activeSperrzeit.endetAt === null,
      remainingMinutes: activeSperrzeit.endetAt ? minutesUntil(activeSperrzeit.endetAt) : null,
      message: activeSperrzeit.nachricht,
      reinigungErlaubt: activeSperrzeit.reinigungErlaubt,
      deviceName: activeSperrzeit.device?.name ?? null,
    } : null,
    openVerschlussAnforderung: openAnf ? {
      endetAt: openAnf.endetAt ? fmt(openAnf.endetAt) : null,
      overdue: openAnf.endetAt ? openAnf.endetAt < now : false,
      remainingMinutes: openAnf.endetAt ? minutesUntil(openAnf.endetAt) : null,
      message: openAnf.nachricht,
      dauerH: openAnf.dauerH,
      reinigungErlaubt: openAnf.reinigungErlaubt,
      deviceName: openAnf.device?.name ?? null,
    } : null,
    openOrgasmusAnforderung: openOrgasmusAnf ? {
      art: openOrgasmusAnf.art,
      beginntAt: fmt(openOrgasmusAnf.beginntAt),
      endetAt: fmt(openOrgasmusAnf.endetAt),
      active: openOrgasmusAnf.beginntAt <= now,
      requiredType: openOrgasmusAnf.vorgegebeneArt,
      message: openOrgasmusAnf.nachricht,
      remainingMinutes: minutesUntil(openOrgasmusAnf.endetAt),
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
  /** Geräte-Check aus dem Kontroll-Foto (nur PRUEFUNG, advisory): wurde das verschlossene Gerät
   *  erkannt? status: "ok" = passendes Gerät · "wrong" = anderes/keins zugeordnet · "missing" = kein
   *  Gerät sichtbar. detected = im Foto erkanntes Gerät, expected = das verschlossene (Soll-)Gerät.
   *  null = nicht geprüft (z.B. nicht verschlossen oder keine Referenzfotos hinterlegt). */
  deviceCheck: { status: string; detected: string | null; expected: string | null } | null;
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
      deviceCheck: mapDeviceCheck(e),
      hasImage: !!e.imageUrl,
      imageExifTime: e.imageExifTime ? formatDateTime(e.imageExifTime) : null,
      timeCorrected: isTimeCorrected(e.startTime, e.createdAt),
    })),
  };
}

/** One device for the MCP `list_devices` tool — inventory metadata. */
export interface DeviceRow {
  name: string;
  /** Free-text notes/description the user stored for this device. */
  description: string | null;
  category: string;
  isKg: boolean;
  purchasePrice: number | null;
  currency: string | null;
  hasImage: boolean;
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
      description: d.description,
      category: d.category?.name ?? "—",
      isKg: d.category?.isBuiltIn ?? false,
      purchasePrice: d.purchasePrice,
      currency: d.currency,
      hasImage: !!d.imageUrl,
      archived: d.archivedAt !== null,
      createdAt: formatDateTime(d.createdAt),
    })),
  };
}

/** Urteil über ein Vergehen: erkannt → (verworfen | bestraft → erledigt). Relevant ("offen") =
 *  unbeurteilt ODER bestraft-aber-nicht-erledigt. `ref` ist die Eingabe für das MCP-Tool judge_offense. */
export interface OffenseJudgment {
  judgment: "open" | "dismissed" | "punished";
  /** Strafe (Freitext) bei judgment="punished". */
  penalty: string | null;
  /** Grund bei judgment="dismissed". */
  reason: string | null;
  judgedBy: string | null;
  judgedAt: string | null;
  /** Bei judgment="punished": ob die Strafe bereits erledigt ist. */
  done: boolean;
  doneAt: string | null;
  ref: { type: string; id: string };
}

/** A Kontroll-based offense formatted for the MCP `get_strafbuch` tool. */
export interface StrafbuchControlRow extends OffenseJudgment {
  code: string;
  deadline: string;
  fulfilledAt: string | null;
  entryTime: string | null;
  backdated: boolean;
  comment: string | null;
  entryNote: string | null;
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
  /** Relevante Vergehen = unbeurteilt ODER bestraft-aber-nicht-erledigt — genau die, die deine
   *  Aufmerksamkeit brauchen (judge_offense bzw. action="complete"). */
  openOffenseCount: number;
  /** Bestrafte Vergehen, deren Strafe noch nicht als erledigt markiert ist. */
  pendingPenaltyCount: number;
  unauthorizedOpenings: ({
    time: string; note: string | null;
    lockPeriodEndedAt: string | null; lockPeriodIndefinite: boolean;
  } & OffenseJudgment)[];
  lateControls: StrafbuchControlRow[];
  rejectedControls: StrafbuchControlRow[];
  cleaningLimitViolations: ({ time: string | null; note: string | null } & OffenseJudgment)[];
  /** Lock entries where a different device than the Anforderung specified was worn. */
  wrongDeviceViolations: ({ time: string | null; note: string | null; deviceName: string | null } & OffenseJudgment)[];
  /** Mandatory orgasm directives (ANWEISUNG) whose window ended without a matching orgasm. */
  missedOrgasmInstructions: ({ windowEndedAt: string; message: string | null; requiredType: string | null } & OffenseJudgment)[];
}

/** Builds the Strafbuch snapshot for the user. Throws if the user does not exist. */
export async function mcpStrafbuch(username: string): Promise<StrafbuchOverview> {
  const { userId } = await loadUserContext(username);
  const now = new Date();
  const fmt = (d: Date) => formatDateTime(d);
  const sb = await buildStrafbuch(userId, now);

  // Urteil pro Vergehen (per refId aufgelöst).
  const judgmentByRef = new Map(sb.strafeRecords.map((r) => [r.refId, r]));
  const detected = collectDetectedOffenses(sb);

  // Relevanz in einem Durchlauf: pending-penalty ⊂ open (= unbeurteilt ODER bestraft-nicht-erledigt).
  let openOffenseCount = 0;
  let pendingPenaltyCount = 0;
  for (const o of detected) {
    const rec = judgmentByRef.get(o.refId);
    const pendingPenalty = rec?.status === "PUNISHED" && rec.erledigtAt == null;
    if (!rec || pendingPenalty) openOffenseCount++;
    if (pendingPenalty) pendingPenaltyCount++;
  }

  const judge = (canonicalType: string, refId: string): OffenseJudgment => {
    const rec = judgmentByRef.get(refId);
    const judgment = rec ? (rec.status === "PUNISHED" ? "punished" : "dismissed") : "open";
    return {
      judgment,
      penalty: judgment === "punished" ? (rec?.reason ?? null) : null,
      reason: judgment === "dismissed" ? (rec?.reason ?? null) : null,
      judgedBy: rec?.judgedBy ?? null,
      judgedAt: rec ? fmt(rec.bestraftDatum) : null,
      done: judgment === "punished" ? rec?.erledigtAt != null : false,
      doneAt: rec?.erledigtAt ? fmt(rec.erledigtAt) : null,
      ref: { type: canonicalType, id: refId },
    };
  };

  const toControlRow = (canonicalType: string) => (k: StrafbuchControlOffense): StrafbuchControlRow => ({
    code: k.code,
    deadline: fmt(k.deadline),
    fulfilledAt: k.fulfilledAt ? fmt(k.fulfilledAt) : null,
    entryTime: k.entryStartTime ? fmt(k.entryStartTime) : null,
    backdated: k.backdated,
    comment: k.kommentar,
    entryNote: k.entryNote,
    ...judge(canonicalType, k.id),
  });

  return {
    schemaVersion: 1 as const,
    user: username,
    generatedAt: fmt(now),
    timezone: APP_TZ,
    detectedOffenseCount: detected.length,
    openOffenseCount,
    pendingPenaltyCount,
    unauthorizedOpenings: sb.unauthorizedOpenings.map((o) => ({
      time: fmt(o.startTime),
      note: o.note,
      lockPeriodEndedAt: o.sperrzeitEndetAt ? fmt(o.sperrzeitEndetAt) : null,
      lockPeriodIndefinite: o.sperrzeitIndefinite,
      ...judge("unauthorized_opening", o.id),
    })),
    lateControls: sb.lateControls.map(toControlRow("late_control")),
    rejectedControls: sb.rejectedControls.map(toControlRow("rejected_control")),
    cleaningLimitViolations: sb.reinigungLimitViolations.map((v) => ({
      time: v.startTime ? fmt(v.startTime) : null,
      note: v.note,
      ...judge("cleaning_limit", v.entryId),
    })),
    wrongDeviceViolations: sb.wrongDeviceViolations.map((v) => ({
      time: v.startTime ? fmt(v.startTime) : null,
      note: v.note,
      deviceName: v.deviceName,
      ...judge("wrong_device", v.entryId),
    })),
    missedOrgasmInstructions: sb.missedOrgasmInstructions.map((m) => ({
      windowEndedAt: fmt(m.endetAt),
      message: m.nachricht,
      requiredType: m.requiredArt,
      ...judge("missed_orgasm", m.id),
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
