import { prisma } from "@/lib/prisma";
import { aktiveKontrolleWhere } from "@/lib/queries";
import { APP_TZ, formatDateTime, formatHours, formatMs, toDateLocale, mapAnforderungStatus, mapVerifikationStatus, getMidnightToday, getWeekStart, getMonthStart, getYearStart, tzDateParts, buildPairs, buildWearPairs, wearingHoursFromPairs, summarizeSessions, completedPairsFrom, WEAR_PAIR, type ReinigungSettings } from "@/lib/utils";
import {
  buildCalendarMonths, buildDailyData, buildMonthStats, buildWeekdayLabels, buildYearHeatmaps, isActive,
  type Entry, type Vorgabe,
} from "@/lib/statsBuilders";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { getKombinierterPill } from "@/lib/kontrollePills";
import { isKgVorgabe } from "@/lib/vorgaben";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "./CategoryIcon";
import WearCalendarSwitcher, { type CalendarVariant } from "./WearCalendarSwitcher";
import YearHeatmap from "./YearHeatmap";
import MonthStats from "./MonthStats";
import Card from "./Card";
import StatsCard from "./StatsCard";
import StatsKontrollenList, { type StatsKontrolleRow } from "./StatsKontrollenList";
import EmptyState from "./EmptyState";
import { ShieldAlert, BarChart2 } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

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
    prisma.kontrollAnforderung.findMany({ where: { userId, ...aktiveKontrolleWhere(now) }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true, timezone: true } }),
    prisma.device.findMany({ where: { userId }, select: { id: true, name: true, purchasePrice: true, currency: true, archivedAt: true } }),
    prisma.deviceCategory.findMany({
      where: { userId, isBuiltIn: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true, icon: true },
    }),
  ]);

  // Sub's own timezone governs all boundary/format math (self or admin-viewed). Read from the
  // user row already loaded above — no extra query.
  const tz = userSettings?.timezone ?? APP_TZ;

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
      ? `${t("fulfilled")}: ${new Date(k.entryTime).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz })}`
      : `${t("created")}: ${formatDateTime(k.time, dl, tz)}`;
    return {
      id: k.id,
      code: k.code,
      pillLabel: pill?.label ?? null,
      pillCls: pill?.cls ?? null,
      primaryLine,
      deadlineLine: k.deadline ? `${t("deadlineLabel")}: ${formatDateTime(new Date(k.deadline), dl, tz)}` : null,
    };
  });

  const completed = completedPairsFrom(buildPairs(entries, [], reinigung));
  const { totalMs, avgMs, longest, shortest } = summarizeSessions(completed);

  const activeEntry = (() => {
    const vs = entries.filter((e) => e.type === "VERSCHLUSS");
    const os = entries.filter((e) => e.type === "OEFFNEN");
    return vs.length > os.length ? [...vs].pop() ?? null : null;
  })();
  const activeDurationMs = activeEntry ? now.getTime() - activeEntry.startTime.getTime() : 0;
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
  const monthStats = buildMonthStats(completed, wearPairs, kgVorgaben, dl, tz);

  const todayStart = getMidnightToday(now, tz);
  const weekStart = getWeekStart(now, tz);
  const monthStart = getMonthStart(now, tz);
  const yearStart = getYearStart(now, tz);

  // Build one goal-card per currently-active vorgabe (KG first, then others by name).
  // Nicht `filter(isActive)`: Array.filter reicht den Index als zweites Argument durch, der dort
  // auf den optionalen `now`-Parameter träfe.
  const activeVorgaben = vorgaben.filter(v => isActive(v)).sort((a, b) => {
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
      // Ziele prorata: startet/endet die Vorgabe mitten in der Periode, wird das Ziel anteilig
      // auf die Überschneidung mit der Periode heruntergerechnet (Anzeige + %-Nenner).
      ...proratedVorgabeTargets(v, now, tz),
      notiz: v.notiz,
      hoursToday: wearingHoursFromPairs(pairs, todayStart, now),
      hoursWeek: wearingHoursFromPairs(pairs, weekStart, now),
      hoursMonth: wearingHoursFromPairs(pairs, monthStart, now),
      hoursYear: wearingHoursFromPairs(pairs, yearStart, now),
    };
  });

  const orgasmDateSet = new Set<string>(
    entries.filter((e) => e.type === "ORGASMUS")
      .map((e) => { const { year, month, day } = tzDateParts(e.startTime, tz); return `${year}-${month}-${day}`; })
  );

  // Heatmap und KG-Kalender brauchen dieselbe Tages-Karte — einmal bauen, zweimal nutzen.
  const kgDailyData = wearPairs.length > 0 ? buildDailyData(wearPairs, orgasmDateSet, tz) : undefined;

  // Jahres-Heatmap (KG-Tragezeit pro Tag, GitHub-Stil) — nur wenn Tragedaten existieren.
  const yearHeatmaps = kgDailyData ? buildYearHeatmaps(wearPairs, orgasmDateSet, now, tz, dl, kgDailyData) : [];
  const weekdayLabels = buildWeekdayLabels(dl);

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
      months: buildCalendarMonths({ entries, wearPairs, vorgaben: kgVorgaben, orgasmDateSet, now, dl, tz, dailyData: kgDailyData }),
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
      months: buildCalendarMonths({ entries: catEntries, wearPairs: catPairs, vorgaben: catVorgaben, orgasmDateSet: new Set(), now, dl, tz }),
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
          <StatsCard label={t("entries")} value={String(completed.length)} />
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
              {t("lastOrgasm")}: <span className="font-semibold">{formatDateTime(lastOrgasmus!.startTime, dl, tz)}</span>
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
              {t("lockedSince")} <span className="font-semibold">{formatDateTime(activeEntry.startTime, dl, tz)}</span>
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
              {g.minProJahrH && (
                <GoalBar label={t("thisYear")} actual={g.hoursYear} target={g.minProJahrH}
                  sub={`${formatHours(g.hoursYear, dl)} ${tc("of")} ${formatHours(g.minProJahrH, dl)}`}
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

      {/* Jahresübersicht (Heatmap) */}
      {yearHeatmaps.length > 0 && (
        <YearHeatmap years={yearHeatmaps} weekdayLabels={weekdayLabels} />
      )}

      {/* Rekorde */}
      {completed.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <p className="text-sm font-bold text-foreground">{t("records")}</p>
          </div>
          <div className="divide-y divide-border-subtle">
            <RecordRow label={t("longestSession")} value={formatMs(longest!.durationMs, dl)} sub={formatDateTime(longest!.verschluss.startTime, dl, tz)} />
            <RecordRow label={t("shortestSession")} value={formatMs(shortest!.durationMs, dl)} sub={formatDateTime(shortest!.verschluss.startTime, dl, tz)} />
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
                  {formatDateTime(e.startTime, dl, tz)}
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
