import { calculateWearingHoursByRange, msToHours, round1 } from "@/lib/utils";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { getActiveVorgabe } from "@/lib/queries";
import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { buildSessions, buildWearSessions, deviceGroupKey, deviceDisplayName, type Session } from "@/lib/sessionModel";
import { pct } from "@/lib/mcp/format";
import { makeIso, loadTrackingContext, loadCategoryNames, type TrackingContext, type TrackingEntry } from "@/lib/mcp/common";

/** Vorberechnete Statistiken & Rekorde aus SEGMENTEN (nicht Labels) — §5/§6/§7. Rein lesend.
 *  Jedes Tool nimmt optional einen vorgeladenen TrackingContext (vom keyholder_dashboard), um
 *  Entries nicht mehrfach zu laden; ohne Kontext lädt es selbst (Einzel-Tool-Aufruf). */

/** Liefert den vorgeladenen Kontext oder lädt ihn (Einzel-Aufruf). */
const ctxOf = (username: string, ctx?: TrackingContext) => ctx ?? loadTrackingContext(username);

/** Median einer Zahlenliste (leere Liste → 0). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const DAY = 86_400_000;

// ── device_stats ─────────────────────────────────────────────────────────────

export interface DeviceStatRow {
  deviceId: string | null;
  deviceName: string | null;
  /** Name der Geräte-Kategorie („KG", „Plug", „Halsband" …). Beim Sammel-Posten ohne Gerät immer
   *  die KG-Kategorie: nur ein KG-Verschluss kann ohne Gerät gebucht werden, ein WEAR-Eintrag
   *  verlangt eines. Damit ist der Posten nicht länger mehrdeutig. */
  category: string | null;
  segmentCount: number;
  totalHours: number;
  avgHours: number;
  medianHours: number;
  minHours: number;
  /** Längste durchgehende Strecke (ein Segment). */
  maxHours: number;
  lastWornAt: string | null;
}

export interface DeviceStatsResult {
  schemaVersion: 2;
  user: string;
  devices: DeviceStatRow[];
}

/** Was pro Gerät gesammelt wird, bevor daraus eine Zeile wird. */
type DeviceAgg = { id: string | null; name: string | null; category: string | null; durations: number[]; lastWorn: Date };
type DeviceSeed = Omit<DeviceAgg, "durations" | "lastWorn">;

/** Eine getragene Strecke in den Topf ihres Geräts. Der Schlüssel wird aus dem Gerät selbst
 *  abgeleitet — ihn getrennt hereinzureichen liesse Schlüssel und Inhalt auseinanderlaufen. */
function collect(byDevice: Map<string, DeviceAgg>, seed: DeviceSeed, start: Date, durationMs: number): void {
  const key = deviceGroupKey(seed);
  const row = byDevice.get(key) ?? { ...seed, durations: [], lastWorn: start };
  row.durations.push(durationMs);
  if (start > row.lastWorn) row.lastWorn = start;
  byDevice.set(key, row);
}

/**
 * Pro Gerät total/avg/median/min/max + längste Strecke + zuletzt getragen.
 *
 * Über ALLE Kategorien, nicht nur KG. Das ist der Kern eines gemeldeten Bugs (14.07.2026): ein Plug
 * mit sauber geloggtem WEAR_BEGIN→WEAR_END-Zyklus tauchte hier überhaupt nicht auf — weder unter
 * seinem Namen noch im „ohne Gerät"-Topf. Grund war nicht die Zuordnung in den Rohdaten (die stimmt),
 * sondern dass `buildSessions` ausschliesslich KG-Paare (VERSCHLUSS/OEFFNEN) kennt. Nicht-KG-Geräte
 * bilden WEAR-Paare, und die wurden nie gepaart.
 *
 * Zwei Pfade, weil KG und WEAR verschiedene Dinge SIND: eine KG-Session zerfällt an Reinigungspausen
 * in Segmente und kennt Bild-gegen-Deklaration-Konflikte — beides hat WEAR nicht. Beide liefern
 * dieselbe `Session`-Form: KG über `buildSessions`, WEAR über `buildWearSessions` (dort steht auch,
 * warum WEAR je GERÄT und nicht je Kategorie gepaart wird). Genau dieselben Sessions zeigt
 * `get_session` — die Statistik zählt sie nur zusammen.
 */
export async function deviceStats(username: string, ctx?: TrackingContext): Promise<DeviceStatsResult> {
  const { userId, entries, reinigung, devices, now, timezone } = await ctxOf(username, ctx);
  const iso = makeIso(timezone);
  const { nameById, kgName } = await loadCategoryNames(userId);

  const byDevice = new Map<string, DeviceAgg>();

  // ── KG: Segmente (Reinigungspausen bereits abgezogen, massgebliches Gerät aufgelöst) ──
  for (const s of buildSessions(entries, reinigung, now, devices)) {
    for (const seg of s.segments) {
      // Nach dem MASSGEBLICHEN Gerät (Bild gewinnt bei echtem Konflikt), wie deviceBreakdown.
      collect(byDevice, { ...seg.deviceEffective, category: kgName }, seg.start, seg.durationMs);
    }
  }

  // ── Nicht-KG: dieselben Trage-Sessions, die auch `get_session` zeigt ──
  for (const s of buildWearSessions(entries, now)) {
    for (const seg of s.segments) {
      collect(byDevice,
        { ...seg.deviceEffective, category: s.categoryId ? nameById.get(s.categoryId) ?? null : null },
        seg.start, seg.durationMs);
    }
  }

  const rows = [...byDevice.values()]
    .map((r) => {
      const total = r.durations.reduce((a, b) => a + b, 0);
      return {
        deviceId: r.id,
        deviceName: deviceDisplayName({ id: r.id, name: r.name }),
        category: r.category,
        segmentCount: r.durations.length,
        totalHours: msToHours(total),
        avgHours: msToHours(total / r.durations.length),
        medianHours: msToHours(median(r.durations)),
        minHours: msToHours(Math.min(...r.durations)),
        maxHours: msToHours(Math.max(...r.durations)),
        lastWornAt: iso(r.lastWorn),
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours);

  return { schemaVersion: 2, user: username, devices: rows };
}

// ── records ──────────────────────────────────────────────────────────────────

export interface RecordsResult {
  schemaVersion: 2;
  user: string;
  /** Längster Lauf (interruption-bereinigte Session-Dauer). */
  longestRunHours: number;
  longestRunEndedAt: string | null;
  /** Aktuell laufende Session (offen), falls vorhanden. */
  currentRunHours: number | null;
  currentRunVsPbPct: number | null;
  daysSinceRecord: number | null;
  /** Stunden seit dem letzten Orgasmus (aktuelle Entsagungs-Strecke). */
  orgasmFreeHours: number | null;
  longestOrgasmFreeHours: number | null;
}

function orgasmTimes(entries: TrackingEntry[]): Date[] {
  return entries.filter((e) => e.type === "ORGASMUS").map((e) => e.startTime).sort((a, b) => a.getTime() - b.getTime());
}

/** Längste Lücke zwischen Orgasmen inkl. der aktuell laufenden Strecke (now − letzter Orgasmus). */
function longestOrgasmGapMs(times: Date[], now: Date): number | null {
  if (times.length === 0) return null;
  let longest = now.getTime() - times[times.length - 1].getTime();
  for (let i = 1; i < times.length; i++) longest = Math.max(longest, times[i].getTime() - times[i - 1].getTime());
  return longest;
}

export async function records(username: string, ctx?: TrackingContext, presessions?: Session[]): Promise<RecordsResult> {
  const { entries, reinigung, devices, now, timezone } = await ctxOf(username, ctx);
  const iso = makeIso(timezone);
  // Vorgebaute Sessions (vom Dashboard) wiederverwenden, statt buildSessions doppelt zu rechnen.
  const sessions = presessions ?? buildSessions(entries, reinigung, now, devices);

  const open = sessions.find((s) => s.isOpen) ?? null;
  const closed = sessions.filter((s) => !s.isOpen);
  const pb = closed.reduce<Session | null>((best, s) => (!best || s.durationMs > best.durationMs ? s : best), null);
  const pbMs = pb?.durationMs ?? 0;

  const times = orgasmTimes(entries);
  const lastOrgasm = times.at(-1) ?? null;
  const gap = longestOrgasmGapMs(times, now);

  return {
    schemaVersion: 2,
    user: username,
    longestRunHours: msToHours(pbMs),
    longestRunEndedAt: iso(pb?.end ?? null),
    currentRunHours: open ? msToHours(open.durationMs) : null,
    currentRunVsPbPct: open && pbMs > 0 ? pct(open.durationMs, pbMs) : null,
    daysSinceRecord: pb?.end ? Math.floor((now.getTime() - pb.end.getTime()) / DAY) : null,
    orgasmFreeHours: lastOrgasm ? msToHours(now.getTime() - lastOrgasm.getTime()) : null,
    longestOrgasmFreeHours: gap == null ? null : msToHours(gap),
  };
}

// ── denial_trend ───────────────────────────────────────────────────────────────

export interface OrgasmHistoryRow {
  at: string;
  intervalSincePrevH: number | null;
  deviceContext: string | null;
}

export interface DenialTrendResult {
  schemaVersion: 2;
  user: string;
  currentStreakH: number | null;
  longestDenialH: number | null;
  avgIntervalH: number | null;
  /** Trend der Intervalle: steigt die Entsagung? (Schnitt der jüngsten vs. aller Intervalle). */
  trendRising: boolean | null;
  recentAvgIntervalH: number | null;
  orgasmHistory: OrgasmHistoryRow[];
}

interface FlatSegment { start: number; end: number; name: string | null }

/** Flacht alle Segmente zu einer nach Start sortierten Liste (Sessions überlappen nicht). */
function flattenSegments(sessions: Session[], now: Date): FlatSegment[] {
  return sessions
    .flatMap((s) => s.segments)
    .map((seg) => ({ start: seg.start.getTime(), end: (seg.end ?? now).getTime(), name: seg.deviceEffective.name }))
    .sort((a, b) => a.start - b.start);
}

/** Gerät, das zum Zeitpunkt t getragen wurde — Binary-Search nach dem rechtesten Segment mit
 *  start ≤ t (Segmente sind überlappungsfrei & sortiert), dann end prüfen. O(log n) statt O(n). */
function deviceContextAt(segs: FlatSegment[], t: number): string | null {
  let lo = 0, hi = segs.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx >= 0 && t <= segs[idx].end ? segs[idx].name : null;
}

export async function denialTrend(username: string, opts: { limit?: number } = {}, ctx?: TrackingContext): Promise<DenialTrendResult> {
  const { entries, reinigung, devices, now, timezone } = await ctxOf(username, ctx);
  const iso = makeIso(timezone);
  const sessions = buildSessions(entries, reinigung, now, devices);
  const segs = flattenSegments(sessions, now);
  const times = orgasmTimes(entries);

  const intervalsH: number[] = [];
  const history: OrgasmHistoryRow[] = times.map((t, i) => {
    const prev = i > 0 ? times[i - 1] : null;
    const intervalH = prev ? msToHours(t.getTime() - prev.getTime()) : null;
    if (intervalH != null) intervalsH.push(intervalH);
    return { at: iso(t)!, intervalSincePrevH: intervalH, deviceContext: deviceContextAt(segs, t.getTime()) };
  });

  const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const avgAll = avg(intervalsH);
  const recentAvg = avg(intervalsH.slice(-3));
  const lastOrgasm = times.at(-1) ?? null;
  const gap = longestOrgasmGapMs(times, now);

  return {
    schemaVersion: 2,
    user: username,
    currentStreakH: lastOrgasm ? msToHours(now.getTime() - lastOrgasm.getTime()) : null,
    longestDenialH: gap == null ? null : msToHours(gap),
    avgIntervalH: avgAll,
    trendRising: recentAvg != null && avgAll != null ? recentAvg >= avgAll : null,
    recentAvgIntervalH: recentAvg,
    orgasmHistory: opts.limit ? history.slice(-opts.limit) : history,
  };
}

// ── period_summary ─────────────────────────────────────────────────────────────

export interface PeriodGoal {
  today: number; week: number; month: number; year: number;
  goalDayH: number | null; goalWeekH: number | null; goalMonthH: number | null; goalYearH: number | null;
  todayPct: number | null; weekPct: number | null; monthPct: number | null; yearPct: number | null;
}

export interface PeriodSummaryResult {
  schemaVersion: 2;
  user: string;
  kg: PeriodGoal;
  categories: ({ name: string } & PeriodGoal)[];
}

const periodGoal = (
  today: number, week: number, month: number, year: number,
  goalDayH: number | null, goalWeekH: number | null, goalMonthH: number | null, goalYearH: number | null,
): PeriodGoal => ({
  today: round1(today), week: round1(week), month: round1(month), year: round1(year),
  goalDayH, goalWeekH, goalMonthH, goalYearH,
  todayPct: pct(today, goalDayH), weekPct: pct(week, goalWeekH), monthPct: pct(month, goalMonthH), yearPct: pct(year, goalYearH),
});

/** Tag/Woche/Monat für KG und je Kategorie inkl. Ziel-Erfüllung. KG nutzt die geteilte
 *  Tracker-Berechnung; Kategorien die geteilte buildCategoryWearGoals. */
export async function periodSummary(username: string, ctx?: TrackingContext): Promise<PeriodSummaryResult> {
  const { userId, entries, reinigung, now } = await ctxOf(username, ctx);

  const [kgVorgabe, categoryGoals] = await Promise.all([
    getActiveVorgabe(userId, now),
    buildCategoryWearGoals(userId, now, entries),
  ]);
  const kg = calculateWearingHoursByRange(entries, now, reinigung);

  // KG-Ziele prorata: startet/endet die aktive Vorgabe mitten in einer Periode, wird das Ziel
  // anteilig auf die Überschneidung mit der Periode heruntergerechnet (Nenner der %-Erfüllung).
  const kgGoal = proratedVorgabeTargets(kgVorgabe, now);

  return {
    schemaVersion: 2,
    user: username,
    kg: periodGoal(
      kg.tagH, kg.wocheH, kg.monatH, kg.jahrH,
      kgGoal.minProTagH, kgGoal.minProWocheH, kgGoal.minProMonatH, kgGoal.minProJahrH,
    ),
    categories: categoryGoals.map((c) => ({
      name: c.name,
      ...periodGoal(
        c.tagH, c.wocheH, c.monatH, c.jahrH,
        hasAnyGoal(c) ? c.goalDayH : null, hasAnyGoal(c) ? c.goalWeekH : null,
        hasAnyGoal(c) ? c.goalMonthH : null, hasAnyGoal(c) ? c.goalYearH : null,
      ),
    })),
  };
}
