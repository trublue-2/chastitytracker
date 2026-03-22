import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { formatDuration, formatDateTime, formatHours, formatMs, toDateLocale, APP_TZ } from "@/lib/utils";
import { KONTROLLE_PILLS } from "@/lib/kontrollePills";
import CalendarExpand from "./CalendarExpand";
import { type CalendarMonthData, type CalendarDayData } from "./CalendarContainer";
import type { DayEntry, DayVorgabe } from "./CalendarContainer";
import MonthStats, { type MonthStat } from "./MonthStats";
import { Lock, LockOpen, ClipboardList, Droplets, ShieldAlert } from "lucide-react";
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

  type UnifiedKontrolle = { id: string; time: Date; status: string; code: string | null; deadline: Date | null; entryTime: Date | null };
  const unifiedKontrollen: UnifiedKontrolle[] = [
    ...kontrollen.map(k => {
      const vs = k.entry?.verifikationStatus ?? null;
      const kNow = new Date();
      const status = k.withdrawnAt ? "withdrawn" :
        !k.entryId ? (k.deadline < kNow ? "overdue" : "open") :
        vs === "rejected" ? "rejected" : vs === "manual" ? "manual" : vs === "ai" ? "ai" : "fulfilled";
      return { id: k.id, time: k.entry ? k.entry.startTime : k.createdAt, status, code: k.code, deadline: k.deadline, entryTime: k.entry?.startTime ?? null };
    }),
    ...standalonePruefungen.map(e => ({
      id: e.id, time: e.startTime, status: e.verifikationStatus === "ai" ? "ai" : "fulfilled",
      code: e.kontrollCode ?? null, deadline: null, entryTime: e.startTime,
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
        const colorClass = pct === 0 ? "bg-gray-50 text-gray-400"
          : pct < 0.2 ? "bg-blue-100 text-blue-700"
          : pct < 0.4 ? "bg-blue-200 text-blue-800"
          : pct < 0.65 ? "bg-blue-400 text-white"
          : "bg-blue-600 text-white";
        const dayEntries: DayEntry[] = entries
          .filter((e) => e.startTime.getFullYear() === year && e.startTime.getMonth() === month && e.startTime.getDate() === day)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .map((e) => ({
            type: e.type,
            time: e.startTime.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }),
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
          <a href={backHref} className="text-sm text-gray-400 hover:text-gray-600 transition">{backLabel ?? "← Zurück"}</a>
        )}
        <h1 className={`text-xl font-bold text-gray-900 ${backHref ? "mt-1" : ""}`}>{pageHeading}</h1>
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
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-2">{t("currentSession")}</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-emerald-800">
              {t("lockedSince")} <span className="font-semibold">{formatDateTime(activeEntry.startTime, dl)}</span>
            </p>
            <span className="text-xl sm:text-2xl font-bold text-emerald-700 whitespace-nowrap">{formatMs(activeDurationMs, dl)}</span>
          </div>
        </section>
      )}

      {/* Trainingsziele */}
      {activeVorgabe && (
        <section className="bg-white rounded-2xl border border-indigo-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-indigo-50 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">{t("trainingGoals")}</p>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">{tc("active")}</span>
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
            {activeVorgabe.notiz && <p className="text-xs text-indigo-400 italic">{activeVorgabe.notiz}</p>}
          </div>
        </section>
      )}

      {/* Kalender */}
      {wearPairs.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-900 mb-3">{t("wearCalendar")}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block" />{t("notWorn")}</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-100 inline-block" />&lt;25%</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 inline-block" />25–40%</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-400 inline-block" />40–65%</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-600 inline-block" />&gt;65%</span>
              <span className="flex items-center gap-1.5">
                <span className="relative inline-flex w-4 h-4 items-center justify-center">
                  <span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block" />
                  <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-rose-400 rounded-full" />
                </span>
                {t("orgasm")}
              </span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 ring-2 ring-emerald-400 inline-block" />{t("dailyGoalReached")}</span>
              <span className="flex items-center gap-1.5"><span className="font-bold text-emerald-500">✓</span>{t("weeklyGoalReached")}</span>
            </div>
          </div>
          <CalendarExpand months={calMonthsData} />
        </section>
      )}

      {/* Rekorde */}
      {completed.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-900">{t("records")}</p>
          </div>
          <div className="divide-y divide-gray-50">
            <RecordRow label={t("longestSession")} value={formatMs(longest!.durationMs, dl)} sub={formatDateTime(longest!.verschluss.startTime, dl)} />
            <RecordRow label={t("shortestSession")} value={formatMs(shortest!.durationMs, dl)} sub={formatDateTime(shortest!.verschluss.startTime, dl)} />
          </div>
        </section>
      )}

      {/* Kontrollen */}
      {unifiedKontrollen.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-900">{t("inspections")}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {unifiedKontrollen.map((k) => {
              const pillLabels: Record<string, string> = {
                open: ta("pillOpen"), overdue: ta("pillOverdue"), fulfilled: ta("pillFulfilled"),
                ai: ta("pillAi"), manual: ta("pillManual"), rejected: ta("pillRejected"), withdrawn: ta("pillWithdrawn"),
              };
              const { cls } = KONTROLLE_PILLS[k.status] ?? KONTROLLE_PILLS["fulfilled"];
              const label = pillLabels[k.status] ?? pillLabels["fulfilled"];
              return (
                <div key={k.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs font-medium border rounded-full px-2 py-0.5 flex-shrink-0 ${cls}`}>{label}</span>
                  {k.code && <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>}
                  {k.deadline
                    ? <span className="text-xs text-gray-400 truncate">{t("deadlineLabel")}: {new Date(k.deadline).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}</span>
                    : <span className="text-xs text-gray-400 truncate">{k.time.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}</span>
                  }
                  {k.entryTime && k.status !== "rejected" && (
                    <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{t("fulfilled")}: {new Date(k.entryTime).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}</span>
                  )}
                  {k.status === "rejected" && k.entryTime && (
                    <span className="text-xs text-red-400 ml-auto flex-shrink-0">{t("rejected")}: {new Date(k.entryTime).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Monatsübersicht */}
      {monthStats.length > 0 && <MonthStats months={monthStats} />}

      {entries.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
          {t("noEntries")}
        </div>
      )}

      {/* Unerlaubte Öffnungen */}
      {unerlaubteOeffnungen.length > 0 && (
        <section className="bg-red-50 rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-200 flex items-center gap-2">
            <ShieldAlert size={15} className="text-red-600 shrink-0" />
            <p className="text-sm font-bold text-red-700">{t("unlawfulOpenings")} ({unerlaubteOeffnungen.length})</p>
          </div>
          <div className="divide-y divide-red-200">
            {unerlaubteOeffnungen.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-sm tabular-nums text-red-800 font-medium shrink-0">
                  {e.startTime.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
                </span>
                {e.note
                  ? <span className="text-sm text-red-600 italic truncate">„{e.note}"</span>
                  : <span className="text-sm text-red-300">–</span>
                }
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alle Einträge */}
      {entries.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-900">{t("allEntries")}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[...entries].sort((a, b) => b.startTime.getTime() - a.startTime.getTime()).map((e) => {
              const typeConfig: Record<string, { label: string; icon: ReactNode; color: string }> = {
                VERSCHLUSS: { label: t("lock"),       icon: <Lock size={12} />,          color: "text-gray-700" },
                OEFFNEN:    { label: t("opening"),    icon: <LockOpen size={12} />,       color: "text-gray-700" },
                PRUEFUNG:   { label: t("inspection"), icon: <ClipboardList size={12} />,  color: "text-orange-600" },
                ORGASMUS:   { label: t("orgasm"),     icon: <Droplets size={12} />,       color: "text-rose-500" },
              };
              const cfg = typeConfig[e.type] ?? { label: e.type, icon: null, color: "text-gray-500" };
              const kontrollStatus = e.type === "PRUEFUNG"
                ? (unifiedKontrollen.find(k => k.id === e.id || (e.kontrollCode && k.code === e.kontrollCode))?.status ?? null)
                : null;
              return (
                <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0 ${cfg.color}`}>
                    {cfg.icon}{cfg.label}
                  </span>
                  <span className="text-sm text-gray-900 tabular-nums">{formatDateTime(e.startTime, dl)}</span>
                  {kontrollStatus && (
                    <span className={`text-xs font-medium border rounded-full px-2 py-0.5 flex-shrink-0 ${KONTROLLE_PILLS[kontrollStatus].cls}`}>
                      {({ open: ta("pillOpen"), overdue: ta("pillOverdue"), fulfilled: ta("pillFulfilled"), ai: ta("pillAi"), manual: ta("pillManual"), rejected: ta("pillRejected"), withdrawn: ta("pillWithdrawn") } as Record<string,string>)[kontrollStatus] ?? kontrollStatus}
                    </span>
                  )}
                  {e.note && <span className="text-xs text-gray-400 italic truncate">„{e.note}"</span>}
                  {e.orgasmusArt && <span className="text-xs text-rose-400 font-medium">{e.orgasmusArt}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${warn ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight leading-none ${warn ? "text-red-500" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function RecordRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div>
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
      <span className="font-mono text-sm font-bold text-gray-900 whitespace-nowrap">{value}</span>
    </div>
  );
}

function GoalBar({ label, actual, target, sub, reachedLabel }: { label: string; actual: number; target: number; sub: string; reachedLabel: string }) {
  const pct = Math.min((actual / target) * 100, 100);
  const reached = actual >= target;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${reached ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
          {reached ? reachedLabel : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${reached ? "bg-emerald-400" : "bg-indigo-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
