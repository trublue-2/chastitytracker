import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { block, type StackBlock } from "@/lib/blockStack";
import type { StatsBlockId } from "@/lib/dashboardBlockRegistry";
import {
  cleaningRulesCached, completedPairsCached, devicesCached, entriesAscCached, entriesCached,
  kgDailyDataCached, kgPairsCached, kgVorgabenCached, kgWearPairsCached, orgasmDaysCached,
  orgasmEntriesCached, statsCategoriesCached, strafbuchCached, subVisibleInspectionsCached,
  vorgabenCached, wearCountsCached, wearPairsByCategoryCached, wearSessionsCached,
} from "@/lib/dashboardData";
import { goalPct, sharePct } from "@/lib/percent";
import {
  formatDate, formatDateTime, formatDurationMs, formatTotalHours, formatTotalMs,
  buildKontrolleItems, isSubVisibleKontrolle, getMidnightToday, getWeekStart, getMonthStart,
  getYearStart, summarizeSessions, wearingHoursFromPairs, WEAR_PAIR,
} from "@/lib/utils";
import {
  buildCalendarMonths, buildMonthStats, buildWeekdayLabels, buildYearHeatmaps, isActive,
} from "@/lib/statsBuilders";
import { resolveGoalTargets, hasVisibleGoalRow, GOAL_PERIODS, type GoalPeriod } from "@/lib/goalFulfillment";
import { getKombinierterPill } from "@/lib/kontrollePills";
import { isKgVorgabe } from "@/lib/vorgaben";
import { categoryStyle } from "@/lib/categoryConstants";
import { KG_CATEGORY_META } from "@/lib/deviceCategories";
import { buildSessions, deviceWearingsOf, type Session } from "@/lib/sessionModel";
import { buildDeviceUsage, type UsageSession } from "@/lib/deviceUsage";
import CategoryIconRender from "./CategoryIcon";
import { type CategoryVariant } from "./CategorySwitcherCard";
import DeviceUsageSwitcher, { type DeviceUsageVariant } from "./DeviceUsageSwitcher";
import WearCalendarSwitcher, { type CalendarVariant } from "./WearCalendarSwitcher";
import YearHeatmap from "./YearHeatmap";
import MonthStats from "./MonthStats";
import Card from "./Card";
import StatsCard from "./StatsCard";
import StatsKontrollenList, { type StatsKontrolleRow } from "./StatsKontrollenList";
import WeightStatsCard from "./WeightStatsCard";
import { getWeightStatsProps } from "@/lib/weightStatsProps";
import { ShieldAlert } from "lucide-react";

/**
 * **Die Blöcke der Statistik — je mit eigener Datenbeschaffung.**
 *
 * EINE Tabelle für ZWEI Oberflächen: `StatsMain` trägt sowohl `/dashboard/stats` (der Träger sieht
 * sich) als auch `/admin/users/[id]/stats` (die Keyholderin sieht einen Sub). Die Blöcke sind
 * dieselben, nur die Konfiguration gehört je dem Betrachter — deshalb zwei Oberflächen im Register
 * und eine Tabelle hier.
 *
 * Der grösste Gewinn dieser Etappe steckt in `unlawfulOpenings`: der Block hängt am Strafbuch, und
 * das sind rund zwanzig Abfragen für EINE Karte. Bis hierher zahlte sie jeder Aufruf der Seite,
 * auch wer die Karte gar nicht sehen wollte.
 */

export interface StatsCtx {
  userId: string;
  now: Date;
  nowMs: number;
  /** Die Zone des TRÄGERS — sie regiert jede Tagesgrenze, auch wenn die Keyholderin zusieht. */
  tz: string;
  dl: string;
  t: Awaited<ReturnType<typeof getTranslations<"stats">>>;
  tc: Awaited<ReturnType<typeof getTranslations<"common">>>;
  ta: Awaited<ReturnType<typeof getTranslations<"admin">>>;
  heading: string;
  backHref?: string;
  backLabel?: string;
}

/**
 * Längste und kürzeste Session.
 *
 * Rechnet auf `completedPairsCached` und damit NUR auf Sessions mit positiver Dauer — anders als
 * die Übersicht darüber, und das mit Absicht: eine Session, die rechnerisch bei null landet, wäre
 * als „kürzeste" keine Auskunft, sondern ein Messfehler.
 */
const sessionRecords = cache(async (userId: string) => {
  const completed = await completedPairsCached(userId);
  // NUR longest/shortest: die Summe und den Mittelwert nennt die Übersicht, und die zählt anders.
  // Beides hier mitzuschleppen hiesse, zwei Zählweisen im selben Datenpaket zu führen.
  const { longest, shortest } = summarizeSessions(completed);
  return { count: completed.length, longest, shortest };
});

/**
 * Die aktiven Vorgaben, KG zuerst, dann die übrigen nach Namen — die Reihenfolge der Ziel-Karten.
 *
 * NUR für die Ziel-Karten: Kalender und Monatsübersicht nehmen bewusst ALLE KG-Vorgaben
 * (`kgVorgabenCached`), denn sie zeigen Vergangenes, und ein ausgelaufenes Ziel gehört zu dem
 * Monat, in dem es galt.
 */
async function activeVorgaben(userId: string) {
  const vorgaben = await vorgabenCached(userId);
  // Nicht `filter(isActive)`: Array.filter reicht den Index als zweites Argument durch, der dort
  // auf den optionalen `now`-Parameter träfe.
  return vorgaben.filter((v) => isActive(v)).sort((a, b) => {
    const aKG = isKgVorgabe(a) ? 0 : 1;
    const bKG = isKgVorgabe(b) ? 0 : 1;
    if (aKG !== bKG) return aKG - bKG;
    return (a.category?.name ?? "").localeCompare(b.category?.name ?? "");
  });
}

/** Die Trage-Sessions je Kategorie in der Form, die die Geräte-Nutzung erwartet. */
const usageOf = (sessions: Session[]): UsageSession[] =>
  deviceWearingsOf(sessions).map((w) => ({ deviceId: w.device.id, durationMs: w.durationMs, start: w.start }));

export const STATS_BLOCK_TABLE: Record<StatsBlockId, StackBlock<StatsCtx>> = {
  heading: async ({ heading, backHref, backLabel }) => (
    <div>
      {backHref && (
        <a href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
      )}
      <h1 className={`text-xl font-bold text-foreground ${backHref ? "mt-1" : ""}`}>{heading}</h1>
    </div>
  ),

  // Übersicht KG-Tragen. Gezählt wird nach `wearCountsCached` — derselben Regel, nach der die
  // Keyholder-Übersicht zählt; zwei Zahlen für dieselbe Frage waren ein Fehler.
  overview: block({
    load: async ({ userId }) => {
      const [counts, entries] = await Promise.all([wearCountsCached(userId), entriesCached(userId)]);
      return { ...counts, missingPhotos: entries.filter((e) => e.type === "VERSCHLUSS" && !e.imageUrl).length };
    },
    render: ({ sessions, closed, totalMs, avgMs, missingPhotos }, { t, dl }) => (
      <section className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint px-1">{t("kgWearOverview")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatsCard label={t("entries")} value={String(sessions)} />
          {/* Summe und Durchschnitt können nur zählen, was abgeschlossen ist — die laufende
              Session steckt in der Anzahl, hat aber noch keine Dauer. Beim Mittelwert steht das
              in der Beschriftung: sonst sieht die Karte aus, als ginge ihre Rechnung nicht auf. */}
          <StatsCard label={t("totalDuration")} value={closed ? formatTotalMs(totalMs) : "–"} />
          <StatsCard label={t("avgDurationCompleted")} value={closed ? formatDurationMs(avgMs, dl) : "–"} />
          <StatsCard label={t("noPhoto")} value={String(missingPhotos)} color={missingPhotos > 0 ? "warn" : undefined} />
        </div>
      </section>
    ),
  }),

  // Orgasmusfreie Zeit
  orgasmFree: block({
    load: async ({ userId }) => (await orgasmEntriesCached(userId))[0] ?? null,
    render: (lastOrgasmus, { now, t, dl, tz }) => lastOrgasmus ? (
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-orgasm-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-orgasm)]">{t("orgasmFreeTime")}</p>
        </div>
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-orgasm-text">
            {t("lastOrgasm")}: <span className="font-semibold">{formatDateTime(lastOrgasmus.startTime, dl, tz)}</span>
          </p>
          <span className="text-xl sm:text-2xl font-bold text-[var(--color-orgasm)] whitespace-nowrap tabular-nums">
            {formatDurationMs(now.getTime() - lastOrgasmus.startTime.getTime(), dl)}
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
    ),
  }),

  // Aktive Session
  activeSession: block({
    load: async ({ userId }) => {
      // Verschlüsse ohne Gegenstück heisst: einer läuft noch. Auf der absteigenden Liste ist der
      // erste Verschluss der jüngste — dasselbe, was die aufsteigende Liste als letzten liefert.
      const entries = await entriesCached(userId);
      const vs = entries.filter((e) => e.type === "VERSCHLUSS");
      const os = entries.filter((e) => e.type === "OEFFNEN");
      return vs.length > os.length ? vs[0] ?? null : null;
    },
    render: (activeEntry, { now, t, dl, tz }) => activeEntry && (
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-lock-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-lock)]">{t("currentSession")}</p>
        </div>
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--color-lock-text)]">
            {t("lockedSince")} <span className="font-semibold">{formatDateTime(activeEntry.startTime, dl, tz)}</span>
          </p>
          <span className="text-xl sm:text-2xl font-bold text-[var(--color-lock-text)] whitespace-nowrap tabular-nums">
            {formatDurationMs(now.getTime() - activeEntry.startTime.getTime(), dl)}
          </span>
        </div>
      </Card>
    ),
  }),

  // Trainingsziele — eine Card pro aktiver Vorgabe (KG zuerst, dann andere Kategorien)
  goals: block({
    load: async ({ userId, nowMs, now, tz }) => {
      const [vorgaben, wearPairs, wearPairsByCategory] = await Promise.all([
        activeVorgaben(userId), kgWearPairsCached(userId, nowMs), wearPairsByCategoryCached(userId, nowMs),
      ]);
      const todayStart = getMidnightToday(now, tz);
      const weekStart = getWeekStart(now, tz);
      const monthStart = getMonthStart(now, tz);
      const yearStart = getYearStart(now, tz);
      return vorgaben.map((v) => {
        const pairs = isKgVorgabe(v) ? wearPairs : wearPairsByCategory.get(v.categoryId!) ?? [];
        return {
          id: v.id,
          name: v.category?.name ?? "KG",
          color: v.category?.color ?? null,
          icon: v.category?.icon ?? null,
          // Ziele je Periode nach den Regeln aus `goalFulfillment.ts` — in einer geteilten Periode
          // ist `targetH` bereits null, der Balken fällt damit von selbst aus.
          goal: resolveGoalTargets(v, now, tz),
          notiz: v.notiz,
          hours: {
            day: wearingHoursFromPairs(pairs, todayStart, now),
            week: wearingHoursFromPairs(pairs, weekStart, now),
            month: wearingHoursFromPairs(pairs, monthStart, now),
            year: wearingHoursFromPairs(pairs, yearStart, now),
          },
        };
      })
        // Eine Karte, deren vier Balken alle ausfallen, wäre eine Überschrift mit „aktiv"-Pille
        // über einem leeren Kasten — am Tag, an dem eine Vorgabe beginnt, ist das der Normalfall.
        .filter((g) => hasVisibleGoalRow(g.goal.targetH));
    },
    render: (goalCards, { t, tc }) => goalCards.map((g) => {
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
            {GOAL_PERIODS.map((period) => {
              const target = g.goal.targetH[period];
              if (!target) return null;
              const actual = g.hours[period];
              return (
                <GoalBar key={period} label={t(GOAL_BAR_LABEL_KEY[period])} actual={actual} target={target}
                  sub={`${formatTotalHours(actual)} ${tc("of")} ${formatTotalHours(target)}`}
                  reachedLabel={t("reached")} />
              );
            })}
            {g.notiz && <p className="text-xs text-[var(--color-request)] italic">{g.notiz}</p>}
          </div>
        </Card>
      );
    }),
  }),

  // Tragekalender — eine Variante je Kategorie mit Tragedaten, KG zuerst.
  // KG zeigt immer die Orgasmus-Punkte; die Geräte-Kategorien nicht (ein Orgasmus gehört zu keinem
  // bestimmten Gerät).
  calendar: block({
    load: async ({ userId, nowMs, now, tz, dl }) => {
      const [entries, vorgaben, kgVorgaben, wearPairs, wearPairsByCategory, orgasmDays, dailyData, categories] = await Promise.all([
        entriesAscCached(userId), vorgabenCached(userId), kgVorgabenCached(userId), kgWearPairsCached(userId, nowMs),
        wearPairsByCategoryCached(userId, nowMs), orgasmDaysCached(userId, tz),
        kgDailyDataCached(userId, nowMs, tz), statsCategoriesCached(userId),
      ]);

      const variants: CalendarVariant[] = [];
      if (wearPairs.length > 0) {
        variants.push({
          ...KG_CATEGORY_META,
          isKG: true,
          months: buildCalendarMonths({
            entries, wearPairs, vorgaben: kgVorgaben, orgasmDateSet: orgasmDays,
            now, dl, tz, dailyData,
          }),
        });
      }
      for (const cat of categories) {
        const catPairs = wearPairsByCategory.get(cat.id) ?? [];
        if (catPairs.length === 0) continue;
        const catEntries = entries.filter(
          (e) => (e.type === WEAR_PAIR.close || e.type === WEAR_PAIR.open) && e.device?.categoryId === cat.id,
        );
        variants.push({
          id: cat.id, name: cat.name, color: cat.color, icon: cat.icon, isKG: false,
          months: buildCalendarMonths({
            entries: catEntries, wearPairs: catPairs, vorgaben: vorgaben.filter((v) => v.categoryId === cat.id),
            orgasmDateSet: new Set(), now, dl, tz,
          }),
        });
      }
      return variants;
    },
    render: (variants) => variants.length > 0 && <WearCalendarSwitcher variants={variants} />,
  }),

  // Jahresübersicht (Heatmap) — nur wenn Tragedaten existieren.
  yearHeatmap: block({
    load: async ({ userId, nowMs, now, tz, dl }) => {
      const [wearPairs, orgasmDays, dailyData] = await Promise.all([
        kgWearPairsCached(userId, nowMs), orgasmDaysCached(userId, tz), kgDailyDataCached(userId, nowMs, tz),
      ]);
      return dailyData ? buildYearHeatmaps(wearPairs, orgasmDays, now, tz, dl, dailyData) : [];
    },
    render: (years, { dl }) => years.length > 0 && (
      <YearHeatmap years={years} weekdayLabels={buildWeekdayLabels(dl)} />
    ),
  }),

  // Rekorde
  records: block({
    load: ({ userId }) => sessionRecords(userId),
    render: ({ count, longest, shortest }, { t, dl, tz }) => count > 0 && (
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle">
          <p className="text-sm font-bold text-foreground">{t("records")}</p>
        </div>
        <div className="divide-y divide-border-subtle">
          <RecordRow label={t("longestSession")} value={formatDurationMs(longest!.durationMs, dl)} sub={formatDateTime(longest!.verschluss.startTime, dl, tz)} />
          <RecordRow label={t("shortestSession")} value={formatDurationMs(shortest!.durationMs, dl)} sub={formatDateTime(shortest!.verschluss.startTime, dl, tz)} />
        </div>
      </Card>
    ),
  }),

  // Device-Nutzung — umschaltbar zwischen KG und den Geräte-Kategorien.
  //
  // BEIDE Pfade gehen durch `deviceWearingsOf` — dieselbe Zurechnungs-Regel, die auch `device_stats`
  // im MCP benutzt: je Session und Gerät EIN Eintrag (Segmente summiert, das Bild gewinnt bei
  // echtem Konflikt). Nur so nennen Chat und Statistik-Seite dieselben Zahlen. Vorher rechnete KG
  // hier auf dem DEKLARIERTEN Gerät des Verschluss-Eintrags über die ganze Session: ein
  // Gerätewechsel über eine Reinigungspause landete komplett beim ersten Gerät.
  deviceUsage: block({
    load: async ({ userId, nowMs, now, tz, dl, t }) => {
      const [entries, cleaning, kgPairs, allDevices, categories, wearSessionList] = await Promise.all([
        entriesCached(userId), cleaningRulesCached(userId), kgPairsCached(userId),
        devicesCached(userId), statsCategoriesCached(userId), wearSessionsCached(userId, nowMs),
      ]);

      const wearSessionsByCategory = new Map<string, UsageSession[]>();
      if (categories.length > 0) {
        for (const s of wearSessionList) {
          if (!s.categoryId) continue;
          const list = wearSessionsByCategory.get(s.categoryId) ?? [];
          list.push(...usageOf([s]));
          wearSessionsByCategory.set(s.categoryId, list);
        }
      }

      const deviceById = new Map(allDevices.map((d) => [d.id, d]));
      const toVariant = (meta: CategoryVariant, sessions: UsageSession[]): DeviceUsageVariant | null => {
        const rows = buildDeviceUsage(sessions, deviceById, t("deviceUnknown"));
        // Ohne ein einziges zugeordnetes Gerät sagt die Card nichts aus (nur „unbekannt"-Zeilen).
        if (!rows.some((r) => r.id !== null)) return null;
        const variantTotalMs = rows.reduce((sum, r) => sum + r.totalMs, 0);
        return {
          ...meta,
          rows: rows.map((r) => ({
            id: r.id,
            name: r.name,
            count: r.count,
            totalStr: formatTotalMs(r.totalMs),
            avgStr: formatDurationMs(r.avgMs, dl),
            medianStr: formatDurationMs(r.medianMs, dl),
            // Bei einer einzigen Session ist die Spanne keine Spanne — dann nur die eine Dauer zeigen.
            rangeStr: r.minMs === r.maxMs ? formatDurationMs(r.minMs, dl) : `${formatDurationMs(r.minMs, dl)} – ${formatDurationMs(r.maxMs, dl)}`,
            lastWornStr: formatDate(r.lastWorn, dl, tz),
            costStr: r.costPerHour !== null && r.currency ? `${r.costPerHour.toFixed(2)} ${r.currency}` : null,
            sharePct: sharePct(r.totalMs, variantTotalMs),
          })),
        };
      };

      return [
        // `kgPairs` durchreichen: `buildSessions` paart sonst dieselben Einträge ein zweites Mal.
        toVariant(KG_CATEGORY_META, usageOf(buildSessions(entries, cleaning.rules, now, allDevices, kgPairs))),
        ...categories.map((cat) => {
          const sessions = wearSessionsByCategory.get(cat.id);
          return sessions ? toVariant(cat, sessions) : null;
        }),
      ].filter((v) => v !== null);
    },
    render: (variants) => variants.length > 0 && <DeviceUsageSwitcher variants={variants} />,
  }),

  // Kontrollen
  inspections: block({
    load: async ({ userId, nowMs, now, tz, dl, t, ta }) => {
      const [anforderungen, entries] = await Promise.all([
        subVisibleInspectionsCached(userId, nowMs), entriesAscCached(userId),
      ]);
      // Zurückgezogene Kontrollen bleiben aussen vor: ein Rückzug (durch die Keyholderin, eine
      // Auto-Kontrolle bei offenem KG oder den Überschneidungs-Schutz) ist ein Nicht-Ereignis — er
      // sagt nichts über den Sub aus und füllte die Liste. VERSÄUMTE Kontrollen bleiben sichtbar:
      // die Eskalation setzt zwar ebenfalls `withdrawnAt`, `mapAnforderungStatus` erkennt sie aber
      // am `autoMarkedRemovedAt` und gibt "missed" zurück.
      const items = buildKontrolleItems(anforderungen, entries.filter((e) => e.type === "PRUEFUNG"), now)
        .filter(isSubVisibleKontrolle)
        .sort((a, b) => b.time.getTime() - a.time.getTime());

      // Pillen und Daten hier auflösen, damit die client-seitig blätternde Liste einfach bleibt
      // (keine Datums- oder i18n-Logik dort).
      return items.map((k): StatsKontrolleRow => {
        const pill = getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta);
        return {
          id: k.id,
          code: k.code,
          pillLabel: pill?.label ?? null,
          pillCls: pill?.cls ?? null,
          primaryLine: k.entryId
            ? `${t("fulfilled")}: ${k.time.toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz })}`
            : `${t("created")}: ${formatDateTime(k.time, dl, tz)}`,
          deadlineLine: k.deadline ? `${t("deadlineLabel")}: ${formatDateTime(k.deadline, dl, tz)}` : null,
        };
      });
    },
    render: (rows, { t }) => rows.length > 0 && (
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle">
          <p className="text-sm font-bold text-foreground">{t("inspections")}</p>
        </div>
        <StatsKontrollenList rows={rows} />
      </Card>
    ),
  }),

  // Gewicht — Verlauf, Trend und Zielband. Der Block lädt sich selbst und liefert `null`, wenn das
  // Feature hier nicht freigeschaltet ist oder noch nichts erfasst wurde; dann entfällt die Karte,
  // ohne dass die Seite eine zweite Bedingung dafür braucht.
  weight: block({
    load: (ctx) => getWeightStatsProps(ctx.userId),
    render: (props) => props && <WeightStatsCard {...props} />,
  }),

  // Monatsübersicht — KG-Ziele, deshalb nur die KG-Vorgaben.
  //
  // Zählt je Monat nur ABGESCHLOSSENE Sessions und summiert sich damit nicht auf die „Tragezeiten"
  // der Übersicht. Das ist Absicht: eine laufende Session gehört in keinen Monat, solange sie
  // läuft — sonst änderte ein abgeschlossener Monat nachträglich seine Zahl.
  monthStats: block({
    load: async ({ userId, nowMs, tz, dl }) => {
      const [completed, wearPairs, kgVorgaben] = await Promise.all([
        completedPairsCached(userId), kgWearPairsCached(userId, nowMs), kgVorgabenCached(userId),
      ]);
      return buildMonthStats(completed, wearPairs, kgVorgaben, dl, tz);
    },
    render: (months) => months.length > 0 && <MonthStats months={months} />,
  }),

  // Unerlaubte Öffnungen — was das STRAFBUCH als solche führt; die Karte formuliert die Bedingung
  // nicht selbst. Vorher tat sie es und zählte deshalb jede ERLAUBTE Reinigungsöffnung während
  // einer Sperrzeit mit, dazu System-Öffnungen (die vermutete Abnahme nach einer verpassten
  // Kontrolle) und Öffnungen in einem offenen Orgasmus-Fenster — und sie ignorierte die
  // Vergehens-Regel `unauthorized_opening`.
  unlawfulOpenings: block({
    load: async ({ userId, nowMs }) => {
      const strafbuch = await strafbuchCached(userId, nowMs);
      // Neueste zuerst — die Reihenfolge der Strafbuch-Listen ist keine Zusage an ihre Leser.
      return [...strafbuch.unauthorizedOpenings].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    },
    render: (openings, { t, dl, tz }) => openings.length > 0 && (
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-warn-border)] flex items-center gap-2">
          <ShieldAlert size={15} className="text-warn shrink-0" />
          <p className="text-sm font-bold text-warn-text">{t("unlawfulOpenings")} ({openings.length})</p>
        </div>
        <div className="divide-y divide-[var(--color-warn-border)]">
          {openings.map((e) => (
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
    ),
  }),
};


// ── Bauteile der Blöcke ────────────────────────────────────────────────────────

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

/** Die Beschriftung je Periode auf dieser Karte — „Heute"/„Diese Woche" statt der kurzen
 *  `day`/`week` der Live-Zeilen. Eine Tabelle statt vier ausgeschriebener Balken-Blöcke: die Regel,
 *  WELCHER Balken erscheint, stand hier sonst ein viertes Mal. */
const GOAL_BAR_LABEL_KEY: Record<GoalPeriod, "today" | "thisWeek" | "thisMonth" | "thisYear"> = {
  day: "today", week: "thisWeek", month: "thisMonth", year: "thisYear",
};

function GoalBar({ label, actual, target, sub, reachedLabel }: { label: string; actual: number; target: number; sub: string; reachedLabel: string }) {
  const pct = goalPct(actual, target) ?? 0;
  const reached = actual >= target;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-foreground-muted">{label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${reached ? "bg-[var(--color-lock-bg)] text-[var(--color-lock-text)] border-[var(--color-lock-border)]" : "bg-surface-raised text-foreground-muted border-border"}`}>
          {reached ? reachedLabel : `${pct}%`}
        </span>
      </div>
      <div className="h-2.5 bg-surface-raised rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${reached ? "bg-[var(--color-lock)]" : "bg-[var(--color-request)]"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-xs text-foreground-faint mt-1">{sub}</p>
    </div>
  );
}
