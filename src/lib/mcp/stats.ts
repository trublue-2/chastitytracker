import { calculateWearingHoursByRange, median, msToHours, round1, summarizeDurations } from "@/lib/utils";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { getActiveVorgabe } from "@/lib/queries";
import { buildCategoryWearGoals, hasAnyGoal } from "@/lib/categoryGoals";
import { buildSessions, buildWearSessions, deviceDisplayName, isUnassignedDevice, segmentsByDevice, type DeviceRef, type Session, type Segment } from "@/lib/sessionModel";
import { pct } from "@/lib/mcp/format";
import { makeIso, buildEnvelope, loadTrackingContext, loadCategoryNames, type Envelope, type TrackingContext, type TrackingEntry } from "@/lib/mcp/common";

/** Vorberechnete Statistiken & Rekorde aus SEGMENTEN (nicht Labels) — §5/§6/§7. Rein lesend.
 *  Jedes Tool nimmt optional einen vorgeladenen TrackingContext (vom keyholder_dashboard), um
 *  Entries nicht mehrfach zu laden; ohne Kontext lädt es selbst (Einzel-Tool-Aufruf). */

/** Liefert den vorgeladenen Kontext oder lädt ihn (Einzel-Aufruf). */
const ctxOf = (username: string, ctx?: TrackingContext) => ctx ?? loadTrackingContext(username);

const DAY = 86_400_000;

// ── device_stats ─────────────────────────────────────────────────────────────

export interface DeviceStatRow {
  deviceId: string | null;
  deviceName: string | null;
  /** Name der Geräte-Kategorie („KG", „Plug", „Halsband" …). Beim Sammel-Posten ohne Gerät immer
   *  die KG-Kategorie: nur ein KG-Verschluss kann ohne Gerät gebucht werden, ein WEAR-Eintrag
   *  verlangt eines. Damit ist der Posten nicht länger mehrdeutig. */
  category: string | null;
  /** Wie oft das Gerät GETRAGEN wurde. Eine Reinigungspause trennt nicht: ein KG, das über zwei
   *  Pausen hinweg drangeblieben ist, ist EINE Session (mit drei Segmenten), nicht drei. */
  sessionCount: number;
  totalHours: number;
  avgHours: number;
  medianHours: number;
  minHours: number;
  /** Längste einzelne Session (Reinigungspausen sind darin abgezogen, aber nicht trennend). */
  maxHours: number;
  lastWornAt: string | null;
}

export interface DeviceStatsResult extends Envelope {
  /** v4: `devices` enthält nur noch echte Geräte; der Sammel-Posten ohne Geräte-Zuordnung
   *  (Projektgeschichte) steht separat in `unassigned` statt als Pseudo-Gerätezeile. */
  schemaVersion: 4;
  user: string;
  devices: DeviceStatRow[];
  /** KG-Tragezeiten ohne Geräte-Zuordnung (deviceId null) — kein Gerät, nicht mit `devices` mischen. */
  unassigned: DeviceStatRow | null;
}

/** Was pro Gerät gesammelt wird, bevor daraus eine Zeile wird. */
type DeviceAgg = { device: DeviceRef; category: string | null; durations: number[]; lastWorn: Date };

/** Die Geräte-Strecken einer Session-Liste in ihre Geräte-Töpfe. Gezählt werden damit SESSIONS,
 *  nicht Segmente: `deviceWearingsOf` fasst die Segmente eines Geräts innerhalb einer Session zu
 *  EINER Strecke zusammen — eine Reinigungspause zerlegt eine durchgehende Tragezeit nicht mehr in
 *  mehrere „Nutzungen". Die Stunden bleiben unberührt (die Pause steckt in keinem Segment). */
function collectSessions(byDevice: Map<string, DeviceAgg>, sessions: Session[], categoryOf: (s: Session) => string | null): void {
  for (const session of sessions) {
    const category = categoryOf(session);
    for (const [key, w] of segmentsByDevice(session.segments)) {
      const row = byDevice.get(key) ?? { device: w.device, category, durations: [], lastWorn: w.start };
      row.durations.push(w.durationMs);
      if (w.start > row.lastWorn) row.lastWorn = w.start;
      byDevice.set(key, row);
    }
  }
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

  // ── KG: Reinigungspausen sind bereits abgezogen, das massgebliche Gerät aufgelöst ──
  collectSessions(byDevice, buildSessions(entries, reinigung, now, devices), () => kgName);

  // ── Nicht-KG: dieselben Trage-Sessions, die auch `get_session` zeigt ──
  collectSessions(byDevice, buildWearSessions(entries, now),
    (s) => (s.categoryId ? nameById.get(s.categoryId) ?? null : null));

  const toRow = (r: DeviceAgg): DeviceStatRow => {
    const m = summarizeDurations(r.durations);
    return {
      deviceId: r.device.id,
      deviceName: deviceDisplayName(r.device),
      category: r.category,
      sessionCount: m.count,
      totalHours: msToHours(m.totalMs),
      avgHours: msToHours(m.avgMs),
      medianHours: msToHours(m.medianMs),
      minHours: msToHours(m.minMs),
      maxHours: msToHours(m.maxMs),
      lastWornAt: iso(r.lastWorn),
    };
  };

  // Sammel-Posten ohne Gerät ist Projektgeschichte, kein Gerät — eigenes Feld statt einer
  // gleichberechtigten Pseudo-Zeile zwischen den echten Geräten. Getrennt wird an der QUELLE
  // (weder id noch Name), nicht am Anzeigenamen: Legacy-Strecken mit Namen aber ohne Geräte-id
  // sind echte (Name-only-)Geräte und bleiben in `devices`.
  const aggs = [...byDevice.values()];
  const unassignedAgg = aggs.find((r) => isUnassignedDevice(r.device));
  return {
    schemaVersion: 4,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    devices: aggs.filter((r) => !isUnassignedDevice(r.device)).map(toRow).sort((a, b) => b.totalHours - a.totalHours),
    unassigned: unassignedAgg ? toRow(unassignedAgg) : null,
  };
}

// ── records ──────────────────────────────────────────────────────────────────

export interface RecordsResult extends Envelope {
  schemaVersion: 2;
  user: string;
  /** Längster Lauf (interruption-bereinigte Session-DAUER, geräteübergreifend summiert). Eine
   *  Session mit mehreren Reinigungspausen und Gerätewechseln stellt eine lückenlose Ein-Geräte-
   *  Strecke hier ARITHMETISCH über eine echte hinüber (A-14, MCP-Befundliste 2026-07-17) — für die
   *  ehrliche Dauertrage-Marke `longestUnbrokenSegmentHours` nutzen. */
  longestRunHours: number;
  longestRunEndedAt: string | null;
  /** Aktuell laufende Session (offen), falls vorhanden. */
  currentRunHours: number | null;
  currentRunVsPbPct: number | null;
  daysSinceRecord: number | null;
  /** Stunden seit dem letzten Orgasmus (aktuelle Entsagungs-Strecke). */
  orgasmFreeHours: number | null;
  longestOrgasmFreeHours: number | null;
  /** Die ehrliche Dauertrage-Marke (A-14): das längste EINZELNE, abgeschlossene Segment — durchgehend,
   *  EIN Gerät, keine Reinigungspause darin. Anders als `longestRunHours` NICHT geräteübergreifend
   *  summiert. null-Felder, wenn es noch kein abgeschlossenes Segment gibt. */
  longestUnbrokenSegmentHours: number | null;
  longestUnbrokenSegmentEndedAt: string | null;
  longestUnbrokenSegmentDeviceName: string | null;
  /** Das GERADE laufende Segment (letztes Segment einer offenen Session), falls vorhanden. */
  currentUnbrokenSegmentHours: number | null;
  currentUnbrokenVsBestPct: number | null;
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

  // A-14: die ehrliche Dauertrage-Marke ist ein SEGMENT (durchgehend, ein Gerät), nicht eine Session
  // (kann mehrere Geräte über Reinigungspausen hinweg summieren, siehe longestRunHours-Kommentar).
  // Nur ABGESCHLOSSENE Segmente (end !== null) zählen für die Bestmarke — ein offenes wächst noch.
  // Ohne flatMap-Zwischenarray: bei vielen Sessions/Segmenten sonst eine unnötige Extra-Allokation.
  let bestSegment: Segment | null = null;
  for (const s of sessions) {
    for (const seg of s.segments) {
      if (seg.end !== null && (!bestSegment || seg.durationMs > bestSegment.durationMs)) bestSegment = seg;
    }
  }
  // Das offene Segment ist immer das LETZTE der offenen Session (segmentsOfPair) — kein Scan nötig.
  const currentSegment = open?.segments.at(-1) ?? null;
  const bestSegmentMs = bestSegment?.durationMs ?? 0;

  const times = orgasmTimes(entries);
  const lastOrgasm = times.at(-1) ?? null;
  const gap = longestOrgasmGapMs(times, now);

  return {
    schemaVersion: 2,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    longestRunHours: msToHours(pbMs),
    longestRunEndedAt: iso(pb?.end ?? null),
    currentRunHours: open ? msToHours(open.durationMs) : null,
    currentRunVsPbPct: open && pbMs > 0 ? pct(open.durationMs, pbMs) : null,
    daysSinceRecord: pb?.end ? Math.floor((now.getTime() - pb.end.getTime()) / DAY) : null,
    orgasmFreeHours: lastOrgasm ? msToHours(now.getTime() - lastOrgasm.getTime()) : null,
    longestOrgasmFreeHours: gap == null ? null : msToHours(gap),
    longestUnbrokenSegmentHours: bestSegment ? msToHours(bestSegment.durationMs) : null,
    longestUnbrokenSegmentEndedAt: iso(bestSegment?.end ?? null),
    longestUnbrokenSegmentDeviceName: bestSegment?.deviceEffective.name ?? null,
    currentUnbrokenSegmentHours: currentSegment ? msToHours(currentSegment.durationMs) : null,
    currentUnbrokenVsBestPct: currentSegment && bestSegmentMs > 0 ? pct(currentSegment.durationMs, bestSegmentMs) : null,
  };
}

// ── denial_trend ───────────────────────────────────────────────────────────────

export interface OrgasmHistoryRow {
  at: string;
  intervalSincePrevH: number | null;
  deviceContext: string | null;
}

export interface DenialTrendResult extends Envelope {
  /** v3: `trendRising` vergleicht jetzt MEDIAN (jüngstes Fenster vs. der Rest) statt MITTELWERT
   *  und liefert erst ab `recentWindowN`+Rest ≥ 8 Intervallen überhaupt einen Wert (A-10,
   *  MCP-Befundliste 2026-07-17: vorher kippte ein einzelner Ausreisser im 3-Punkte-Mittel das
   *  Ergebnis — z.B. Intervalle 515.5→180.1→116.6, klar fallend, meldeten trotzdem `true`, weil
   *  der eine Ausreisser (515.5) den "recent"-Mittelwert hochzog). `avgIntervalH`/
   *  `recentAvgIntervalH` bleiben unverändert Mittelwerte (informativ) — nur `trendRising` selbst
   *  rechnet jetzt robuster. Grenzen dieser Robustheit: der Median eines 3er-Fensters toleriert
   *  GENAU EINEN Ausreisser (Breakdown Point 1/3) — bei ZWEI auffälligen Werten im selben Fenster
   *  kippt er wieder. Und "Rest" wächst mit der Historie: bei langer Nutzung wird der Vergleich
   *  eher "jüngst vs. Lebenszeit-Basislinie" als ein echter Kurzfrist-Trend. */
  schemaVersion: 3;
  user: string;
  currentStreakH: number | null;
  longestDenialH: number | null;
  avgIntervalH: number | null;
  /** Trend der Intervalle: steigt die Entsagung? MEDIAN-Vergleich (jüngstes Fenster vs. die
   *  restlichen Intervalle), robust gegen einen einzelnen Ausreisser. `null` bei weniger als 8
   *  Intervallen insgesamt — zu wenig Datenlage für eine Aussage, statt eine vorzutäuschen. */
  trendRising: boolean | null;
  recentAvgIntervalH: number | null;
  /** Wie viele Intervalle in `recentAvgIntervalH`/den MEDIAN-Vergleich für `trendRising` eingehen.
   *  null bei keinen Intervallen. */
  recentWindowN: number | null;
  /** Grobe Einschätzung der Datenlage hinter `trendRising`: "low" (< 8 Intervalle, `trendRising`
   *  ist null), "medium" (8–14), "high" (≥ 15). */
  trendConfidence: "low" | "medium" | "high" | null;
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
  // 3 = Bestand aus der Vor-A-10-Fassung (recentAvgIntervalH), hier unverändert übernommen. Für den
  // MEDIAN-Vergleich unten bedeutet das einen Breakdown Point von 1/3 (ein einzelner Ausreisser im
  // Fenster kippt das Ergebnis nicht, zwei schon) — ein grösseres Fenster wäre robuster, kostet aber
  // Aktualität. Nicht weiter austariert; A-10 behebt den gemeldeten Ein-Ausreisser-Fall, mehr nicht.
  const RECENT_WINDOW = 3;
  const recentIntervals = intervalsH.slice(-RECENT_WINDOW);
  const recentAvg = avg(recentIntervals);
  const recentWindowN = recentIntervals.length || null;
  const lastOrgasm = times.at(-1) ?? null;
  const gap = longestOrgasmGapMs(times, now);

  // A-10: trendRising vergleicht MEDIAN des jüngsten Fensters gegen den MEDIAN der übrigen
  // (älteren) Intervalle — robust gegen einen einzelnen Ausreisser, anders als der bisherige
  // Mittelwert-Vergleich. "übrig" statt "alle": das Fenster selbst fliesst sonst in beide Seiten
  // ein und verwässert den Kontrast. Erst ab MIN_N Intervallen überhaupt ein Wert (sonst null statt
  // einer Zahl, die Sicherheit vortäuscht).
  // MIN_N_FOR_TREND > RECENT_WINDOW ist ein Invariant, kein Laufzeit-Check: sobald die erste
  // Bedingung unten zutrifft, hat olderIntervals zwangsläufig mindestens MIN_N_FOR_TREND-RECENT_WINDOW
  // Einträge — ein zusätzliches `olderIntervals.length > 0` wäre nie erreichbar.
  const MIN_N_FOR_TREND = 8;
  const olderIntervals = intervalsH.slice(0, Math.max(0, intervalsH.length - RECENT_WINDOW));
  const trendRising = intervalsH.length >= MIN_N_FOR_TREND
    ? median(recentIntervals) >= median(olderIntervals)
    : null;
  // Grobe, bewusst nicht statistisch hergeleitete Stufen (kein Signifikanztest o.ä.) — sie sollen
  // dem Konsumenten nur grob sagen "wenig/etwas/viel Historie hinter trendRising", nicht mehr.
  // < MIN_N_FOR_TREND = "low" (trendRising ist dort ohnehin null); ab 15 "high", weil dann auch das
  // ältere Vergleichsfenster (n − RECENT_WINDOW) selbst zweistellig ist.
  const trendConfidence: DenialTrendResult["trendConfidence"] =
    intervalsH.length === 0 ? null
    : intervalsH.length < MIN_N_FOR_TREND ? "low"
    : intervalsH.length < 15 ? "medium"
    : "high";

  return {
    schemaVersion: 3,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    currentStreakH: lastOrgasm ? msToHours(now.getTime() - lastOrgasm.getTime()) : null,
    longestDenialH: gap == null ? null : msToHours(gap),
    avgIntervalH: avgAll,
    trendRising,
    recentAvgIntervalH: recentAvg,
    recentWindowN,
    trendConfidence,
    orgasmHistory: opts.limit ? history.slice(-opts.limit) : history,
  };
}

// ── period_summary ─────────────────────────────────────────────────────────────

export interface PeriodGoal {
  today: number; week: number; month: number; year: number;
  goalDayH: number | null; goalWeekH: number | null; goalMonthH: number | null; goalYearH: number | null;
  todayPct: number | null; weekPct: number | null; monthPct: number | null; yearPct: number | null;
}

export interface PeriodSummaryResult extends Envelope {
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
  const { userId, entries, reinigung, now, timezone } = await ctxOf(username, ctx);
  const iso = makeIso(timezone);

  const [kgVorgabe, categoryGoals] = await Promise.all([
    getActiveVorgabe(userId, now),
    buildCategoryWearGoals(userId, now, entries),
  ]);
  const kg = calculateWearingHoursByRange(entries, now);

  // KG-Ziele prorata: startet/endet die aktive Vorgabe mitten in einer Periode, wird das Ziel
  // anteilig auf die Überschneidung mit der Periode heruntergerechnet (Nenner der %-Erfüllung).
  const kgGoal = proratedVorgabeTargets(kgVorgabe, now);

  return {
    schemaVersion: 2,
    user: username,
    ...buildEnvelope(now, iso, timezone),
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
