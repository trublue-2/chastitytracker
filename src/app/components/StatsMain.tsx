import { prisma } from "@/lib/prisma";
import { formatDuration, formatDateTime, formatTime, formatHours, formatMs, toDateLocale, APP_TZ, mapAnforderungStatus, mapVerifikationStatus, getMidnightToday, getWeekStart, getMonthStart, tzDateParts, midnightInTZ, buildPairs, interruptionPauseMs, buildWearPairs, wearingHoursFromPairs, WEAR_PAIR, type WearPair, type ReinigungSettings } from "@/lib/utils";
import { getKombinierterPill } from "@/lib/kontrollePills";
import { isKgVorgabe } from "@/lib/vorgaben";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "./CategoryIcon";
import WearCalendarSwitcher, { type CalendarVariant } from "./WearCalendarSwitcher";
import { type CalendarMonthData, type CalendarDayData } from "./CalendarContainer";
import type { DayEntry, DayVorgabe } from "./CalendarContainer";
import MonthStats, { type MonthStat } from "./MonthStats";
import Card from "./Card";
import StatsCard from "./StatsCard";
import StatsKontrollenList, { type StatsKontrolleRow } from "./StatsKontrollenList";
import EmptyState from "./EmptyState";
import { ShieldAlert, BarChart2 } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type Entry = { id: string; type: string; startTime: Date; imageUrl: string | null; note: string | null; orgasmusArt?: string | null; kontrollCode?: string | null; verifikationStatus?: string | null; oeffnenGrund?: string | null; deviceId?: string | null };
type CompletedPair = { verschluss: Entry; oeffnen: Entry; durationMs: number };
type Vorgabe = {
  gueltigAb: Date;
  gueltigBis: Date | null;
  minProTagH: number | null;
  minProWocheH: number | null;
  minProMonatH: number | null;
  notiz: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildWearPairs + wearingHoursFromPairs imported from @/lib/utils

function buildDailyData(wearPairs: WearPair[], orgasmDates: Set<string>): Map<string, { hours: number; hasOrgasm: boolean }> {
  const map = new Map<string, { hours: number; hasOrgasm: boolean }>();
  for (const pair of wearPairs) {
    let d = midnightInTZ(pair.start);
    while (d.getTime() < pair.end.getTime()) {
      const nextD = new Date(d.getTime() + 86_400_000);
      const overlap = Math.min(pair.end.getTime(), nextD.getTime()) - Math.max(pair.start.getTime(), d.getTime());
      if (overlap > 0) {
        const { year, month, day } = tzDateParts(new Date(d.getTime() + 43_200_000));
        const key = `${year}-${month}-${day}`;
        const existing = map.get(key) ?? { hours: 0, hasOrgasm: false };
        existing.hours += overlap / 3_600_000;
        map.set(key, existing);
      }
      d = nextD;
    }
  }
  for (const key of orgasmDates) {
    const existing = map.get(key) ?? { hours: 0, hasOrgasm: false };
    existing.hasOrgasm = true;
    map.set(key, existing);
  }
  return map;
}

function tzYearMonth(d: Date): string {
  const parts = new Intl.DateTimeFormat("de-CH", { year: "numeric", month: "2-digit", timeZone: APP_TZ }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  return `${y}-${m}`;
}

function buildMonthStats(pairs: CompletedPair[], wearPairs: WearPair[], vorgaben: Vorgabe[], dl = "de-CH"): MonthStat[] {
  const map = new Map<string, Omit<MonthStat, "wearHours" | "targetH">>();
  for (const p of pairs) {
    const d = p.verschluss.startTime;
    const key = tzYearMonth(d);
    const label = d.toLocaleString(dl, { month: "long", year: "numeric", timeZone: APP_TZ });
    const existing = map.get(key) ?? { key, label, count: 0, totalMs: 0, longestMs: 0 };
    existing.count++;
    existing.totalMs += p.durationMs;
    if (p.durationMs > existing.longestMs) existing.longestMs = p.durationMs;
    map.set(key, existing);
  }
  for (const wp of wearPairs) {
    for (const d of [wp.start, wp.end]) {
      const key = tzYearMonth(d);
      if (!map.has(key)) {
        const label = d.toLocaleString(dl, { month: "long", year: "numeric", timeZone: APP_TZ });
        map.set(key, { key, label, count: 0, totalMs: 0, longestMs: 0 });
      }
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => {
      const [y, m] = v.key.split("-").map(Number);
      const monthStart = midnightInTZ(new Date(Date.UTC(y, m - 1, 1, 12)));
      const monthEnd = midnightInTZ(new Date(Date.UTC(y, m, 1, 12)));
      const wearHours = wearingHoursFromPairs(wearPairs, monthStart, monthEnd);
      const applicableVorgabe = vorgaben.find(
        (vg) => vg.gueltigAb < monthEnd && (vg.gueltigBis === null || vg.gueltigBis >= monthStart)
      );
      return { ...v, wearHours, targetH: applicableVorgabe?.minProMonatH ?? null };
    });
}

function isActive(v: { gueltigAb: Date; gueltigBis: Date | null }): boolean {
  const now = new Date();
  return v.gueltigAb <= now && (v.gueltigBis === null || v.gueltigBis >= now);
}


function buildCalendarMonths(opts: {
  entries: Entry[];
  wearPairs: WearPair[];
  vorgaben: Vorgabe[];
  orgasmDateSet: Set<string>;
  now: Date;
  dl: string;
}): CalendarMonthData[] {
  const { entries, wearPairs, vorgaben, orgasmDateSet, now, dl } = opts;
  const dailyData = buildDailyData(wearPairs, orgasmDateSet);
  const { year: nowYear, month: nowMonth } = tzDateParts(now);
  const jsWeekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Bucket entries by YMD once so day-cells become O(1) lookups instead of O(N) filters.
  const entriesByYMD = new Map<string, Entry[]>();
  for (const e of entries) {
    const { year, month, day } = tzDateParts(e.startTime);
    const key = `${year}-${month}-${day}`;
    const list = entriesByYMD.get(key);
    if (list) list.push(e); else entriesByYMD.set(key, [e]);
  }

  const calMonthsData: CalendarMonthData[] = [];
  for (let i = 0; i <= 3; i++) {
    const { year, month } = tzDateParts(new Date(Date.UTC(nowYear, nowMonth - i, 1, 12)));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDayNoon = new Date(Date.UTC(year, month, 1, 12));
    const firstDayWd = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" })
      .formatToParts(firstDayNoon).find(p => p.type === "weekday")!.value;
    const startOffset = (jsWeekdayMap[firstDayWd] + 6) % 7;
    const label = firstDayNoon.toLocaleString(dl, { month: "long", year: "numeric", timeZone: APP_TZ });

    const monthStartDate = midnightInTZ(firstDayNoon);
    const monthEndDate = midnightInTZ(new Date(Date.UTC(year, month + 1, 1, 12)));
    const vorgabe = vorgaben.find(
      (vg) => vg.gueltigAb < monthEndDate && (vg.gueltigBis === null || vg.gueltigBis >= monthStartDate)
    ) ?? null;
    const monthTotalH = wearingHoursFromPairs(wearPairs, monthStartDate, monthEndDate);
    const monthGoalMet = vorgabe?.minProMonatH != null ? monthTotalH >= vorgabe.minProMonatH : null;
    const monthGoalPct = vorgabe?.minProMonatH ? Math.round((monthTotalH / vorgabe.minProMonatH) * 100) : null;

    const cells: (number | null)[] = [
      ...Array(startOffset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, k) => k + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (CalendarDayData | null)[][] = [];
    const weekGoalMet: (boolean | null)[] = [];
    const weekGoalPct: (number | null)[] = [];

    for (let w = 0; w < cells.length; w += 7) {
      const weekCells = cells.slice(w, w + 7);
      const firstDayOfRow = weekCells.find((x) => x != null);
      let weekH = 0;
      if (firstDayOfRow != null && vorgabe?.minProWocheH != null) {
        const anchorNoon = new Date(Date.UTC(year, month, firstDayOfRow, 12));
        const anchorWd = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" })
          .formatToParts(anchorNoon).find(p => p.type === "weekday")!.value;
        const dow = (jsWeekdayMap[anchorWd] + 6) % 7;
        const wkStart = midnightInTZ(new Date(Date.UTC(year, month, firstDayOfRow - dow, 12)));
        const wkEnd = new Date(wkStart.getTime() + 7 * 86_400_000);
        weekH = wearingHoursFromPairs(wearPairs, wkStart, wkEnd);
      }
      weekGoalMet.push(vorgabe?.minProWocheH != null && firstDayOfRow != null ? weekH >= vorgabe.minProWocheH : null);
      weekGoalPct.push(vorgabe?.minProWocheH && firstDayOfRow != null ? Math.round((weekH / vorgabe.minProWocheH) * 100) : null);

      weeks.push(weekCells.map((day): CalendarDayData | null => {
        if (!day) return null;
        const key = `${year}-${month}-${day}`;
        const data = dailyData.get(key);
        const pct = data ? Math.min(data.hours / 24, 1) : 0;
        const dailyGoalMet = vorgabe?.minProTagH != null && data != null ? data.hours >= vorgabe.minProTagH : null;
        const colorClass = pct === 0 ? "bg-surface-raised text-foreground-faint"
          : pct < 0.2 ? "bg-blue-100 text-blue-900"
          : pct < 0.4 ? "bg-blue-200 text-blue-900"
          : pct < 0.65 ? "bg-blue-400 text-white"
          : "bg-blue-600 text-white";
        // entries arrived from prisma sorted by startTime asc, so per-day buckets are too.
        const dayEntries: DayEntry[] = (entriesByYMD.get(key) ?? []).map((e) => ({
          type: e.type,
          time: formatTime(e.startTime, dl),
          note: e.note,
          orgasmusArt: e.orgasmusArt,
        }));
        const dayVorgabe: DayVorgabe | null = vorgabe ? {
          minProTagH: vorgabe.minProTagH, minProWocheH: vorgabe.minProWocheH,
          minProMonatH: vorgabe.minProMonatH, notiz: vorgabe.notiz,
        } : null;
        const dateLabel = new Date(Date.UTC(year, month, day, 12)).toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric", timeZone: APP_TZ });
        return { day, dateLabel, wearHours: data?.hours ?? 0, hasOrgasm: data?.hasOrgasm ?? false, dailyGoalMet, colorClass, entries: dayEntries, vorgabe: dayVorgabe };
      }));
    }

    calMonthsData.push({ label, weeks, weekGoalMet, weekGoalPct, monthGoalMet, monthGoalPct });
  }
  return calMonthsData;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default async function StatsMain({ userId, heading, backHref, backLabel, compact }: {
  userId: string;
  heading?: string;
  backHref?: string;
  backLabel?: string;
  /** Use narrower container (max-w-2xl px-4) for dashboard embedding */
  compact?: boolean;
}) {
  const t = await getTranslations("stats");
  const td = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const ta = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  const [entries, vorgaben, kontrollen, sperrzeiten, userSettings, allDevices, nonKgCategories] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "asc" },
      include: { device: { select: { categoryId: true } } },
    }),
    prisma.trainingVorgabe.findMany({
      where: { userId },
      orderBy: { gueltigAb: "desc" },
      include: { category: { select: { id: true, name: true, color: true, icon: true, isBuiltIn: true } } },
    }),
    prisma.kontrollAnforderung.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true } }),
    prisma.device.findMany({ where: { userId }, select: { id: true, name: true, purchasePrice: true, currency: true, archivedAt: true } }),
    prisma.deviceCategory.findMany({
      where: { userId, isBuiltIn: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true, icon: true },
    }),
  ]);

  const reinigung: ReinigungSettings = {
    erlaubt: userSettings?.reinigungErlaubt ?? false,
    maxMinuten: userSettings?.reinigungMaxMinuten ?? 15,
  };

  const linkedEntryIds = new Set(kontrollen.map(k => k.entryId).filter(Boolean));
  const allPruefungen = entries.filter(e => e.type === "PRUEFUNG");
  const standalonePruefungen = allPruefungen.filter(e => !linkedEntryIds.has(e.id));

  type UnifiedKontrolle = { id: string; time: Date; anforderungStatus: string | null; verifikationStatus: string | null; code: string | null; deadline: Date | null; entryTime: Date | null };
  const unifiedKontrollen: UnifiedKontrolle[] = [
    ...kontrollen.map(k => ({
      id: k.id,
      time: k.entry ? k.entry.startTime : k.createdAt,
      anforderungStatus: mapAnforderungStatus(k, k.entry?.startTime ?? null, now),
      verifikationStatus: k.entry ? mapVerifikationStatus(k.entry.verifikationStatus) : null,
      code: k.code,
      deadline: k.deadline,
      entryTime: k.entry?.startTime ?? null,
    })),
    ...standalonePruefungen.map(e => ({
      id: e.id,
      time: e.startTime,
      anforderungStatus: null,
      verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
      code: e.kontrollCode ?? null,
      deadline: null,
      entryTime: e.startTime,
    })),
  ].sort((a, b) => b.time.getTime() - a.time.getTime());

  // Pre-format kontrolle rows for the client-paginated list — pills and dates resolved here so the
  // client component can stay simple (no date/i18n logic).
  const kontrolleRows: StatsKontrolleRow[] = unifiedKontrollen.map((k) => {
    const pill = getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta);
    const primaryLine = k.entryTime
      ? `${t("fulfilled")}: ${new Date(k.entryTime).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}`
      : `${t("created")}: ${formatDateTime(k.time, dl)}`;
    return {
      id: k.id,
      code: k.code,
      pillLabel: pill?.label ?? null,
      pillCls: pill?.cls ?? null,
      primaryLine,
      deadlineLine: k.deadline ? `${t("deadlineLabel")}: ${formatDateTime(new Date(k.deadline), dl)}` : null,
    };
  });

  const allPairs = buildPairs(entries, [], reinigung)
    .filter(p => p.oeffnen !== null)
    .map(p => ({
      verschluss: p.verschluss,
      oeffnen: p.oeffnen!,
      durationMs: p.oeffnen!.startTime.getTime() - p.verschluss.startTime.getTime() - interruptionPauseMs(p.interruptions),
    }));
  const completed = allPairs.filter((p) => p.durationMs > 0);
  const totalMs = completed.reduce((s, p) => s + p.durationMs, 0);

  const activeEntry = (() => {
    const vs = entries.filter((e) => e.type === "VERSCHLUSS");
    const os = entries.filter((e) => e.type === "OEFFNEN");
    return vs.length > os.length ? [...vs].pop() ?? null : null;
  })();
  const activeDurationMs = activeEntry ? now.getTime() - activeEntry.startTime.getTime() : 0;

  const longest = completed.length ? completed.reduce((a, b) => (a.durationMs > b.durationMs ? a : b)) : null;
  const shortest = completed.length ? completed.reduce((a, b) => (a.durationMs < b.durationMs ? a : b)) : null;
  const avgMs = completed.length ? Math.round(totalMs / completed.length) : 0;
  const missingPhotos = entries.filter((e) => e.type === "VERSCHLUSS" && !e.imageUrl).length;
  const lastOrgasmus = [...entries].filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;
  const orgasmusFreiMs = lastOrgasmus ? now.getTime() - lastOrgasmus.startTime.getTime() : null;

  const oeffnungen = entries.filter(e => e.type === "OEFFNEN");
  const unerlaubteOeffnungen = oeffnungen.filter(o =>
    sperrzeiten.some(s =>
      s.endetAt !== null &&
      s.createdAt <= o.startTime &&
      s.endetAt > o.startTime &&
      (s.withdrawnAt === null || s.withdrawnAt > o.startTime)
    )
  ).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // KG-only vorgaben drive the wear calendar + month stats (which visualize KG).
  // The Trainingsziele cards below render ALL active vorgaben across categories.
  const kgVorgaben = vorgaben.filter(isKgVorgabe);
  const wearPairs = buildWearPairs(entries, now);
  const monthStats = buildMonthStats(completed, wearPairs, kgVorgaben, dl);

  const todayStart = getMidnightToday(now);
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);

  // Build one goal-card per currently-active vorgabe (KG first, then others by name).
  const activeVorgaben = vorgaben.filter(isActive).sort((a, b) => {
    const aKG = isKgVorgabe(a) ? 0 : 1;
    const bKG = isKgVorgabe(b) ? 0 : 1;
    if (aKG !== bKG) return aKG - bKG;
    return (a.category?.name ?? "").localeCompare(b.category?.name ?? "");
  });
  const goalCards = activeVorgaben.map((v) => {
    const kg = isKgVorgabe(v);
    const pairs = kg ? wearPairs : buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: v.categoryId! });
    return {
      id: v.id,
      name: v.category?.name ?? "KG",
      color: v.category?.color ?? null,
      icon: v.category?.icon ?? null,
      minProTagH: v.minProTagH,
      minProWocheH: v.minProWocheH,
      minProMonatH: v.minProMonatH,
      notiz: v.notiz,
      hoursToday: wearingHoursFromPairs(pairs, todayStart, now),
      hoursWeek: wearingHoursFromPairs(pairs, weekStart, now),
      hoursMonth: wearingHoursFromPairs(pairs, monthStart, now),
    };
  });

  const orgasmDateSet = new Set<string>(
    entries.filter((e) => e.type === "ORGASMUS")
      .map((e) => { const { year, month, day } = tzDateParts(e.startTime); return `${year}-${month}-${day}`; })
  );

  // Build calendar variants — one per category that has wear data.
  // KG always shows orgasm dots; non-KG categories don't (orgasms are not device-specific).
  const calendarVariants: CalendarVariant[] = [];
  if (wearPairs.length > 0) {
    calendarVariants.push({
      id: "kg",
      name: "KG",
      color: "cat-steel",
      icon: "Lock",
      isKG: true,
      months: buildCalendarMonths({ entries, wearPairs, vorgaben: kgVorgaben, orgasmDateSet, now, dl }),
    });
  }
  for (const cat of nonKgCategories) {
    const catPairs = buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: cat.id });
    if (catPairs.length === 0) continue;
    const catVorgaben = vorgaben.filter((v) => v.categoryId === cat.id);
    const catEntries = entries.filter(
      (e) => (e.type === WEAR_PAIR.close || e.type === WEAR_PAIR.open) && e.device?.categoryId === cat.id
    );
    calendarVariants.push({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      isKG: false,
      months: buildCalendarMonths({ entries: catEntries, wearPairs: catPairs, vorgaben: catVorgaben, orgasmDateSet: new Set(), now, dl }),
    });
  }

  // ── Device usage stats ─────────────────────────────────────────────────────
  const deviceMap = new Map(allDevices.map((d) => [d.id, d]));
  type DeviceStat = { id: string | null; name: string; count: number; totalMs: number; avgMs: number; purchasePrice: number | null; currency: string | null; costPerHour: number | null };
  const deviceStatsMap = new Map<string | null, { count: number; totalMs: number }>();

  for (const pair of completed) {
    const dId = pair.verschluss.deviceId ?? null;
    const existing = deviceStatsMap.get(dId) ?? { count: 0, totalMs: 0 };
    existing.count++;
    existing.totalMs += pair.durationMs;
    deviceStatsMap.set(dId, existing);
  }
  // Also count active session if currently locked
  if (activeEntry?.deviceId) {
    const dId = activeEntry.deviceId;
    const existing = deviceStatsMap.get(dId) ?? { count: 0, totalMs: 0 };
    existing.count++;
    existing.totalMs += activeDurationMs;
    deviceStatsMap.set(dId, existing);
  }

  const deviceStats: DeviceStat[] = Array.from(deviceStatsMap.entries())
    .map(([dId, { count, totalMs: dTotalMs }]) => {
      const device = dId ? deviceMap.get(dId) : null;
      const totalHours = dTotalMs / 3_600_000;
      const costPerHour = device?.purchasePrice && totalHours > 0
        ? device.purchasePrice / totalHours
        : null;
      return {
        id: dId,
        name: device?.name ?? t("deviceUnknown"),
        count,
        totalMs: dTotalMs,
        avgMs: count > 0 ? Math.round(dTotalMs / count) : 0,
        purchasePrice: device?.purchasePrice ?? null,
        currency: device?.currency ?? null,
        costPerHour,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  // Only show if at least one entry has a device assigned
  const hasDeviceData = deviceStats.some((d) => d.id !== null);

  const pageHeading = heading ?? t("title");

  if (entries.length === 0) {
    return (
      <main className={`flex-1 w-full ${compact ? "max-w-2xl mx-auto px-4 py-6" : "max-w-5xl px-6 py-8"} flex flex-col gap-6`}>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        <h1 className="text-xl font-bold text-foreground">{pageHeading}</h1>
        <Card padding="default">
          <EmptyState
            icon={<BarChart2 size={32} />}
            title={t("noEntries")}
          />
        </Card>
      </main>
    );
  }

  return (
    <main className={`flex-1 w-full ${compact ? "max-w-2xl mx-auto px-4 py-6" : "max-w-5xl px-6 py-8"} flex flex-col gap-6`}>
      <div>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        <h1 className={`text-xl font-bold text-foreground ${backHref ? "mt-1" : ""}`}>{pageHeading}</h1>
      </div>

      {/* Übersicht KG-Tragen */}
      <section className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint px-1">{t("kgWearOverview")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatsCard label={t("entries")} value={String(allPairs.length)} />
          <StatsCard label={t("totalDuration")} value={totalMs > 0 ? formatMs(totalMs, dl) : "–"} />
          <StatsCard label={t("avgDuration")} value={formatMs(avgMs, dl)} />
          <StatsCard label={t("noPhoto")} value={String(missingPhotos)} color={missingPhotos > 0 ? "warn" : undefined} />
        </div>
      </section>

      {/* Orgasmusfreie Zeit */}
      {orgasmusFreiMs !== null ? (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-orgasm-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-orgasm)]">{t("orgasmFreeTime")}</p>
          </div>
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-orgasm-text">
              {t("lastOrgasm")}: <span className="font-semibold">{formatDateTime(lastOrgasmus!.startTime, dl)}</span>
            </p>
            <span className="text-xl sm:text-2xl font-bold text-[var(--color-orgasm)] whitespace-nowrap tabular-nums">
              {formatMs(orgasmusFreiMs, dl)}
            </span>
          </div>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("orgasmFreeTime")}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-foreground-faint font-semibold">{t("noEntry")}</p>
          </div>
        </Card>
      )}

      {/* Aktive Session */}
      {activeEntry && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-lock-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-lock)]">{t("currentSession")}</p>
          </div>
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-lock-text)]">
              {t("lockedSince")} <span className="font-semibold">{formatDateTime(activeEntry.startTime, dl)}</span>
            </p>
            <span className="text-xl sm:text-2xl font-bold text-[var(--color-lock-text)] whitespace-nowrap tabular-nums">{formatMs(activeDurationMs, dl)}</span>
          </div>
        </Card>
      )}

      {/* Trainingsziele — eine Card pro aktiver Vorgabe (KG zuerst, dann andere Kategorien) */}
      {goalCards.map((g) => {
        const style = g.color ? categoryStyle(g.color) : null;
        return (
          <Card key={g.id} padding="none" className="overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--color-request-border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {style && g.icon && (
                  <div
                    className="size-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: style.backgroundColor, color: style.color }}
                    aria-hidden
                  >
                    <CategoryIconRender name={g.icon} className="size-3.5" />
                  </div>
                )}
                <p className="text-sm font-bold text-foreground truncate">
                  {t("trainingGoalFor", { name: g.name })}
                </p>
              </div>
              <span className="text-xs font-bold text-[var(--color-request-text)] bg-[var(--color-request-bg)] border border-[var(--color-request-border)] px-2 py-0.5 rounded-full shrink-0">{tc("active")}</span>
            </div>
            <div className="px-6 py-4 flex flex-col gap-4">
              {g.minProTagH && (
                <GoalBar label={t("today")} actual={g.hoursToday} target={g.minProTagH}
                  sub={`${formatHours(g.hoursToday, dl)} ${tc("of")} ${formatHours(g.minProTagH, dl)}`}
                  reachedLabel={t("reached")} />
              )}
              {g.minProWocheH && (
                <GoalBar label={t("thisWeek")} actual={g.hoursWeek} target={g.minProWocheH}
                  sub={`${formatHours(g.hoursWeek, dl)} ${tc("of")} ${formatHours(g.minProWocheH, dl)}`}
                  reachedLabel={t("reached")} />
              )}
              {g.minProMonatH && (
                <GoalBar label={t("thisMonth")} actual={g.hoursMonth} target={g.minProMonatH}
                  sub={`${formatHours(g.hoursMonth, dl)} ${tc("of")} ${formatHours(g.minProMonatH, dl)}`}
                  reachedLabel={t("reached")} />
              )}
              {g.notiz && <p className="text-xs text-[var(--color-request)] italic">{g.notiz}</p>}
            </div>
          </Card>
        );
      })}

      {/* Tragekalender */}
      {calendarVariants.length > 0 && (
        <WearCalendarSwitcher variants={calendarVariants} />
      )}

      {/* Rekorde */}
      {completed.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground">{t("records")}</p>
          </div>
          <div className="divide-y divide-border-subtle">
            <RecordRow label={t("longestSession")} value={formatMs(longest!.durationMs, dl)} sub={formatDateTime(longest!.verschluss.startTime, dl)} />
            <RecordRow label={t("shortestSession")} value={formatMs(shortest!.durationMs, dl)} sub={formatDateTime(shortest!.verschluss.startTime, dl)} />
          </div>
        </Card>
      )}

      {/* KG-Nutzung */}
      {hasDeviceData && deviceStats.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground">{t("deviceUsage")}</p>
          </div>
          <div className="divide-y divide-border-subtle">
            {deviceStats.map((ds) => (
              <div key={ds.id ?? "_none"} className="px-6 py-4 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-semibold ${ds.id ? "text-foreground" : "text-foreground-faint"}`}>
                    {ds.name}
                  </span>
                  <span className="text-xs text-foreground-faint">
                    {t("deviceSessions", { count: ds.count })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
                  <span>{t("deviceTotalDuration")}: <strong className="text-foreground">{formatMs(ds.totalMs, dl)}</strong></span>
                  <span>{t("deviceAvgDuration")}: <strong className="text-foreground">{formatMs(ds.avgMs, dl)}</strong></span>
                  {ds.costPerHour !== null && ds.currency && (
                    <span>{t("deviceCostPerHour")}: <strong className="text-foreground">{ds.costPerHour.toFixed(2)} {ds.currency}</strong></span>
                  )}
                </div>
                {/* Usage bar relative to total */}
                {totalMs > 0 && (
                  <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden mt-0.5">
                    <div className="h-full rounded-full bg-lock" style={{ width: `${Math.round((ds.totalMs / totalMs) * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Kontrollen */}
      {kontrolleRows.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground">{t("inspections")}</p>
          </div>
          <StatsKontrollenList rows={kontrolleRows} />
        </Card>
      )}

      {/* Monatsübersicht */}
      {monthStats.length > 0 && <MonthStats months={monthStats} />}

      {/* Unerlaubte Öffnungen */}
      {unerlaubteOeffnungen.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--color-warn-border)] flex items-center gap-2">
            <ShieldAlert size={15} className="text-warn shrink-0" />
            <p className="text-sm font-bold text-warn-text">{t("unlawfulOpenings")} ({unerlaubteOeffnungen.length})</p>
          </div>
          <div className="divide-y divide-[var(--color-warn-border)]">
            {unerlaubteOeffnungen.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-sm tabular-nums text-warn-text font-medium shrink-0">
                  {formatDateTime(e.startTime, dl)}
                </span>
                {e.note
                  ? <span className="text-sm text-warn italic truncate">„{e.note}"</span>
                  : <span className="text-sm text-foreground-faint">–</span>
                }
              </div>
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RecordRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div>
        <p className="text-sm font-semibold text-foreground-muted">{label}</p>
        <p className="text-xs text-foreground-faint mt-0.5">{sub}</p>
      </div>
      <span className="font-mono text-sm font-bold text-foreground whitespace-nowrap">{value}</span>
    </div>
  );
}

function GoalBar({ label, actual, target, sub, reachedLabel }: { label: string; actual: number; target: number; sub: string; reachedLabel: string }) {
  const pct = Math.min((actual / target) * 100, 100);
  const reached = actual >= target;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-foreground-muted">{label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${reached ? "bg-[var(--color-lock-bg)] text-[var(--color-lock-text)] border-[var(--color-lock-border)]" : "bg-surface-raised text-foreground-muted border-border"}`}>
          {reached ? reachedLabel : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="h-2.5 bg-surface-raised rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${reached ? "bg-[var(--color-lock)]" : "bg-[var(--color-request)]"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-foreground-faint mt-1">{sub}</p>
    </div>
  );
}
