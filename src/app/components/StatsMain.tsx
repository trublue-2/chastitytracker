import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { formatDuration, formatDateTime, formatTime, formatHours, formatMs, toDateLocale, APP_TZ, mapAnforderungStatus, mapVerifikationStatus } from "@/lib/utils";
import { getKombinierterPill } from "@/lib/kontrollePills";
import CalendarExpand from "./CalendarExpand";
import { type CalendarMonthData, type CalendarDayData } from "./CalendarContainer";
import type { DayEntry, DayVorgabe } from "./CalendarContainer";
import MonthStats, { type MonthStat } from "./MonthStats";
import AllEntriesClient, { type AllEntryData } from "./AllEntriesClient";
import { ShieldAlert } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type Entry = { id: string; type: string; startTime: Date; imageUrl: string | null; note: string | null; orgasmusArt?: string | null; kontrollCode?: string | null; verifikationStatus?: string | null };
type WearPair = { start: Date; end: Date };
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

function buildCompletedPairs(entries: Entry[]): CompletedPair[] {
  const asc = [...entries].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const pairs: CompletedPair[] = [];
  let pending: Entry | null = null;
  for (const e of asc) {
    if (e.type === "VERSCHLUSS") {
      if (pending) pairs.push({ verschluss: pending, oeffnen: { ...pending, type: "SYNTHETIC" }, durationMs: 0 });
      pending = e;
    } else if (e.type === "OEFFNEN" && pending) {
      pairs.push({ verschluss: pending, oeffnen: e, durationMs: e.startTime.getTime() - pending.startTime.getTime() });
      pending = null;
    }
  }
  return pairs;
}

function buildWearPairs(entries: Entry[], now: Date): WearPair[] {
  const asc = [...entries]
    .filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const pairs: WearPair[] = [];
  let pending: Entry | null = null;
  for (const e of asc) {
    if (e.type === "VERSCHLUSS") {
      if (pending) pairs.push({ start: pending.startTime, end: now });
      pending = e;
    } else if (e.type === "OEFFNEN" && pending) {
      pairs.push({ start: pending.startTime, end: e.startTime });
      pending = null;
    }
  }
  if (pending) pairs.push({ start: pending.startTime, end: now });
  return pairs;
}

function wearingHoursInRange(pairs: WearPair[], rangeStart: Date, rangeEnd: Date): number {
  let totalMs = 0;
  for (const p of pairs) {
    const overlap = Math.min(p.end.getTime(), rangeEnd.getTime()) - Math.max(p.start.getTime(), rangeStart.getTime());
    if (overlap > 0) totalMs += overlap;
  }
  return totalMs / 3600000;
}

function buildDailyData(wearPairs: WearPair[], orgasmDates: Set<string>): Map<string, { hours: number; hasOrgasm: boolean }> {
  const map = new Map<string, { hours: number; hasOrgasm: boolean }>();
  for (const pair of wearPairs) {
    let d = new Date(pair.start.getFullYear(), pair.start.getMonth(), pair.start.getDate());
    const endDay = new Date(pair.end.getFullYear(), pair.end.getMonth(), pair.end.getDate());
    while (d <= endDay) {
      const dayBegin = new Date(d);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const overlap = Math.min(pair.end.getTime(), dayEnd.getTime()) - Math.max(pair.start.getTime(), dayBegin.getTime());
      if (overlap > 0) {
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const existing = map.get(key) ?? { hours: 0, hasOrgasm: false };
        existing.hours += overlap / 3600000;
        map.set(key, existing);
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  for (const key of orgasmDates) {
    const existing = map.get(key) ?? { hours: 0, hasOrgasm: false };
    existing.hasOrgasm = true;
    map.set(key, existing);
  }
  return map;
}


function buildMonthStats(pairs: CompletedPair[], wearPairs: WearPair[], vorgaben: Vorgabe[], dl = "de-CH"): MonthStat[] {
  const map = new Map<string, Omit<MonthStat, "wearHours" | "targetH">>();
  for (const p of pairs) {
    const d = p.verschluss.startTime;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString(dl, { month: "long", year: "numeric" });
    const existing = map.get(key) ?? { key, label, count: 0, totalMs: 0, longestMs: 0 };
    existing.count++;
    existing.totalMs += p.durationMs;
    if (p.durationMs > existing.longestMs) existing.longestMs = p.durationMs;
    map.set(key, existing);
  }
  for (const wp of wearPairs) {
    for (const d of [wp.start, wp.end]) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        const label = d.toLocaleString(dl, { month: "long", year: "numeric" });
        map.set(key, { key, label, count: 0, totalMs: 0, longestMs: 0 });
      }
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => {
      const [y, m] = v.key.split("-").map(Number);
      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m, 1);
      const wearHours = wearingHoursInRange(wearPairs, monthStart, monthEnd);
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

// ── Main component ─────────────────────────────────────────────────────────────

export default async function StatsMain({ userId, heading, backHref, backLabel }: {
  userId: string;
  heading?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const t = await getTranslations("stats");
  const td = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const ta = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  const [entries, vorgaben, kontrollen, sperrzeiten] = await Promise.all([
    prisma.entry.findMany({ where: { userId }, orderBy: { startTime: "asc" } }),
    prisma.trainingVorgabe.findMany({ where: { userId }, orderBy: { gueltigAb: "desc" } }),
    prisma.kontrollAnforderung.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT" } }),
  ]);

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

  const allPairs = buildCompletedPairs(entries);
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

  // Unerlaubte Öffnungen: ÖFFNEN-Einträge während einer aktiven Sperrzeit
  const oeffnungen = entries.filter(e => e.type === "OEFFNEN");
  const unerlaubteOeffnungen = oeffnungen.filter(o =>
    sperrzeiten.some(s =>
      s.endetAt !== null &&
      s.createdAt <= o.startTime &&
      s.endetAt > o.startTime &&
      (s.withdrawnAt === null || s.withdrawnAt > o.startTime)
    )
  ).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  const activeVorgabe = vorgaben.find(isActive) ?? null;
  const wearPairs = buildWearPairs(entries, now);
  const monthStats = buildMonthStats(completed, wearPairs, vorgaben, dl);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const hoursToday = wearingHoursInRange(wearPairs, todayStart, now);
  const hoursWeek = wearingHoursInRange(wearPairs, weekStart, now);
  const hoursMonth = wearingHoursInRange(wearPairs, monthStart, now);

  const orgasmDateSet = new Set<string>(
    entries.filter((e) => e.type === "ORGASMUS")
      .map((e) => `${e.startTime.getFullYear()}-${e.startTime.getMonth()}-${e.startTime.getDate()}`)
  );
  const dailyData = buildDailyData(wearPairs, orgasmDateSet);

  // Build serializable calendar data for CalendarContainer
  const calMonthsData: CalendarMonthData[] = [];
  for (let i = 0; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const label = firstDay.toLocaleString(dl, { month: "long", year: "numeric" });

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);
    const vorgabe = vorgaben.find(
      (vg) => vg.gueltigAb < monthEnd && (vg.gueltigBis === null || vg.gueltigBis >= monthStart)
    ) ?? null;
    const monthTotalH = wearingHoursInRange(wearPairs, monthStart, monthEnd);
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
        const anchor = new Date(year, month, firstDayOfRow);
        const dow = (anchor.getDay() + 6) % 7;
        const wkStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow);
        const wkEnd = new Date(wkStart.getFullYear(), wkStart.getMonth(), wkStart.getDate() + 7);
        weekH = wearingHoursInRange(wearPairs, wkStart, wkEnd);
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
          : pct < 0.2 ? "bg-blue-100 text-blue-700"
          : pct < 0.4 ? "bg-blue-200 text-blue-800"
          : pct < 0.65 ? "bg-blue-400 text-white"
          : "bg-blue-600 text-white";
        const dayEntries: DayEntry[] = entries
          .filter((e) => e.startTime.getFullYear() === year && e.startTime.getMonth() === month && e.startTime.getDate() === day)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .map((e) => ({
            type: e.type,
            time: formatTime(e.startTime, dl),
            note: e.note,
            orgasmusArt: e.orgasmusArt,
          }));
        const dayVorgabe: DayVorgabe | null = vorgabe ? {
          minProTagH: vorgabe.minProTagH, minProWocheH: vorgabe.minProWocheH,
          minProMonatH: vorgabe.minProMonatH, notiz: vorgabe.notiz,
        } : null;
        const dateLabel = new Date(year, month, day).toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric", timeZone: APP_TZ });
        return { day, dateLabel, wearHours: data?.hours ?? 0, hasOrgasm: data?.hasOrgasm ?? false, dailyGoalMet, colorClass, entries: dayEntries, vorgabe: dayVorgabe };
      }));
    }

    calMonthsData.push({ label, weeks, weekGoalMet, weekGoalPct, monthGoalMet, monthGoalPct });
  }

  const pageHeading = heading ?? t("title");

  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <div>
        {backHref && (
          <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel ?? "← Zurück"}</a>
        )}
        <h1 className={`text-xl font-bold text-foreground ${backHref ? "mt-1" : ""}`}>{pageHeading}</h1>
      </div>

      {/* Gesamtübersicht */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label={t("entries")} value={String(allPairs.length)} />
        <StatCard label={t("totalDuration")} value={totalMs > 0 ? formatMs(totalMs, dl) : "–"} />
        <StatCard label={t("avgDuration")} value={formatMs(avgMs, dl)} />
        <StatCard label={t("noPhoto")} value={String(missingPhotos)} warn={missingPhotos > 0} />
      </section>

      {/* Orgasmusfreie Zeit */}
      {orgasmusFreiMs !== null ? (
        <section className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">{t("orgasmFreeTime")}</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-blue-800">
              {t("lastOrgasm")}: <span className="font-semibold">{formatDateTime(lastOrgasmus!.startTime, dl)}</span>
            </p>
            <span className="text-xl sm:text-2xl font-bold text-blue-700 whitespace-nowrap">
              {formatMs(orgasmusFreiMs, dl)}
            </span>
          </div>
        </section>
      ) : (
        <section className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">{t("orgasmFreeTime")}</p>
          <p className="text-sm text-blue-300 font-semibold">{t("noEntry")}</p>
        </section>
      )}

      {/* Aktive Session */}
      {activeEntry && (
        <section className="bg-[var(--color-lock-bg)] border border-[var(--color-lock-border)] rounded-2xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-lock)] mb-2">{t("currentSession")}</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-lock-text)]">
              {t("lockedSince")} <span className="font-semibold">{formatDateTime(activeEntry.startTime, dl)}</span>
            </p>
            <span className="text-xl sm:text-2xl font-bold text-[var(--color-lock-text)] whitespace-nowrap">{formatMs(activeDurationMs, dl)}</span>
          </div>
        </section>
      )}

      {/* Trainingsziele */}
      {activeVorgabe && (
        <section className="bg-surface rounded-2xl border border-[var(--color-request-border)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--color-request-border)] flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">{t("trainingGoals")}</p>
            <span className="text-xs font-bold text-[var(--color-request-text)] bg-[var(--color-request-bg)] border border-[var(--color-request-border)] px-2 py-0.5 rounded-full">{tc("active")}</span>
          </div>
          <div className="px-6 py-4 flex flex-col gap-4">
            {activeVorgabe.minProTagH && (
              <GoalBar label={t("today")} actual={hoursToday} target={activeVorgabe.minProTagH}
                sub={`${formatHours(hoursToday, dl)} ${tc("of")} ${formatHours(activeVorgabe.minProTagH, dl)}`}
                reachedLabel={t("reached")} />
            )}
            {activeVorgabe.minProWocheH && (
              <GoalBar label={t("thisWeek")} actual={hoursWeek} target={activeVorgabe.minProWocheH}
                sub={`${formatHours(hoursWeek, dl)} ${tc("of")} ${formatHours(activeVorgabe.minProWocheH, dl)}`}
                reachedLabel={t("reached")} />
            )}
            {activeVorgabe.minProMonatH && (
              <GoalBar label={t("thisMonth")} actual={hoursMonth} target={activeVorgabe.minProMonatH}
                sub={`${formatHours(hoursMonth, dl)} ${tc("of")} ${formatHours(activeVorgabe.minProMonatH, dl)}`}
                reachedLabel={t("reached")} />
            )}
            {activeVorgabe.notiz && <p className="text-xs text-[var(--color-request)] italic">{activeVorgabe.notiz}</p>}
          </div>
        </section>
      )}

      {/* Kalender */}
      {wearPairs.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground mb-3">{t("wearCalendar")}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground-muted">
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-surface-raised border border-border inline-block" />{t("notWorn")}</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-100 inline-block" />&lt;25%</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 inline-block" />25–40%</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-400 inline-block" />40–65%</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-600 inline-block" />&gt;65%</span>
              <span className="flex items-center gap-1.5">
                <span className="relative inline-flex w-4 h-4 items-center justify-center">
                  <span className="w-4 h-4 rounded bg-surface-raised border border-border inline-block" />
                  <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[var(--color-orgasm)] rounded-full" />
                </span>
                {t("orgasm")}
              </span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 ring-2 ring-[var(--color-lock)] inline-block" />{t("dailyGoalReached")}</span>
              <span className="flex items-center gap-1.5"><span className="font-bold text-[var(--color-lock)]">✓</span>{t("weeklyGoalReached")}</span>
            </div>
          </div>
          <CalendarExpand months={calMonthsData} />
        </section>
      )}

      {/* Rekorde */}
      {completed.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground">{t("records")}</p>
          </div>
          <div className="divide-y divide-border-subtle">
            <RecordRow label={t("longestSession")} value={formatMs(longest!.durationMs, dl)} sub={formatDateTime(longest!.verschluss.startTime, dl)} />
            <RecordRow label={t("shortestSession")} value={formatMs(shortest!.durationMs, dl)} sub={formatDateTime(shortest!.verschluss.startTime, dl)} />
          </div>
        </section>
      )}

      {/* Kontrollen */}
      {unifiedKontrollen.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground">{t("inspections")}</p>
          </div>
          <div className="divide-y divide-border-subtle">
            {unifiedKontrollen.map((k) => {
              const kPill = getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta);
              return (
                <div key={k.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {kPill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${kPill.cls}`}>{kPill.label}</span>}
                    {k.code && <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{k.code}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
                    {k.entryTime
                      ? <span>Erfüllt: {new Date(k.entryTime).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}</span>
                      : <span>Erstellt: {formatDateTime(k.time, dl)}</span>
                    }
                    {k.deadline && <span>Frist: {formatDateTime(new Date(k.deadline), dl)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Monatsübersicht */}
      {monthStats.length > 0 && <MonthStats months={monthStats} />}

      {entries.length === 0 && (
        <div className="bg-surface rounded-2xl border border-border-subtle py-20 text-center text-foreground-faint text-sm">
          {t("noEntries")}
        </div>
      )}

      {/* Unerlaubte Öffnungen */}
      {unerlaubteOeffnungen.length > 0 && (
        <section className="bg-warn-bg rounded-2xl border border-[var(--color-warn-border)] overflow-hidden">
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
        </section>
      )}

      {/* Alle Einträge */}
      {entries.length > 0 && (() => {
        const typeIconMap: Record<string, AllEntryData["typeIcon"]> = {
          VERSCHLUSS: "lock", OEFFNEN: "lockopen", PRUEFUNG: "clipboard", ORGASMUS: "droplets",
        };
        const typeColorMap: Record<string, string> = {
          VERSCHLUSS: "text-foreground-muted", OEFFNEN: "text-foreground-muted",
          PRUEFUNG: "text-[var(--color-inspect)]", ORGASMUS: "text-[var(--color-orgasm)]",
        };
        const typeLabelMap: Record<string, string> = {
          VERSCHLUSS: t("lock"), OEFFNEN: t("opening"), PRUEFUNG: t("inspection"), ORGASMUS: t("orgasm"),
        };
        const allEntries: AllEntryData[] = [...entries]
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
          .map((e) => {
            const kontrollEntry = e.type === "PRUEFUNG"
              ? (unifiedKontrollen.find(k => k.id === e.id || (e.kontrollCode && k.code === e.kontrollCode)) ?? null)
              : null;
            const kontrollPill = kontrollEntry
              ? getKombinierterPill(kontrollEntry.anforderungStatus, kontrollEntry.verifikationStatus, ta)
              : null;
            return {
              id: e.id,
              type: e.type,
              dateTimeStr: formatDateTime(e.startTime, dl),
              typeLabel: typeLabelMap[e.type] ?? e.type,
              typeColor: typeColorMap[e.type] ?? "text-foreground-muted",
              typeIcon: typeIconMap[e.type] ?? "lock",
              pillLabel: kontrollPill?.label ?? null,
              pillCls: kontrollPill?.cls ?? null,
              note: e.note,
              orgasmusArt: e.orgasmusArt ?? null,
              editHref: `/dashboard/edit/${e.id}`,
            };
          });
        return <AllEntriesClient entries={allEntries} title={t("allEntries")} />;
      })()}
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${warn ? "bg-warn-bg border-[var(--color-warn-border)]" : "bg-surface border-border-subtle"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight leading-none ${warn ? "text-warn" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-foreground-faint mt-1">{sub}</p>}
    </div>
  );
}

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
