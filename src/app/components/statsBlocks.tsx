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
import Section from "./Section";
import { blockInsetCls } from "./inputStyles";
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
  /**
   * Ist DIESE Auswertung der Hauptbereich ihrer Seite?
   *
   * Auf `/dashboard/stats` ja — die Überschrift ist dann die Ebene 1 der Seite. Im Keyholder-Reiter
   * nein: dort spannt `admin/users/[id]/layout.tsx` die Landmarke auf und trägt mit dem Namen des
   * Trägers bereits eine `h1`. Eine zweite hier gäbe der Seite zwei Wurzeln, und die
   * Überschriften-Navigation zeigte zwei gleichrangige Einstiege für einen Bildschirm.
   */
  isLandmark: boolean;
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
  heading: async ({ heading, backHref, backLabel, isLandmark }) => {
    const H = isLandmark ? "h1" : "h2";
    return (
      <div>
        {backHref && (
          <a href={backHref} className="text-neben text-foreground-faint hover:text-foreground-muted transition">{backLabel}</a>
        )}
        <H className={`font-serif text-titel text-foreground ${backHref ? "mt-1" : ""}`}>{heading}</H>
      </div>
    );
  },

  // Übersicht KG-Tragen. Gezählt wird nach `wearCountsCached` — derselben Regel, nach der die
  // Keyholder-Übersicht zählt; zwei Zahlen für dieselbe Frage waren ein Fehler.
  overview: block({
    load: async ({ userId }) => {
      const [counts, entries] = await Promise.all([wearCountsCached(userId), entriesCached(userId)]);
      return { ...counts, missingPhotos: entries.filter((e) => e.type === "VERSCHLUSS" && !e.imageUrl).length };
    },
    render: ({ sessions, closed, totalMs, avgMs, missingPhotos }, { t, dl }) => (
      <Section title={t("kgWearOverview")}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
          <StatsCard label={t("entries")} value={String(sessions)} />
          {/* Summe und Durchschnitt können nur zählen, was abgeschlossen ist — die laufende
              Session steckt in der Anzahl, hat aber noch keine Dauer. Beim Mittelwert steht das
              in der Beschriftung: sonst sieht die Karte aus, als ginge ihre Rechnung nicht auf. */}
          <StatsCard label={t("totalDuration")} value={closed ? formatTotalMs(totalMs) : "–"} />
          <StatsCard label={t("avgDurationCompleted")} value={closed ? formatDurationMs(avgMs, dl) : "–"} />
          {/* Ohne Farbe: die Zahl zählt Vergangenes, an dem sich nichts mehr ändern lässt. Sie trug
              bisher `color="warn"` — wirkungslos, weil die Klasse zusammengesetzt war und Tailwind
              sie nie erzeugt hat. Mit dem Fix an `StatsCard` wäre sie plötzlich das lauteste
              Element der Seite geworden. */}
          <StatsCard label={t("noPhoto")} value={String(missingPhotos)} />
        </div>
      </Section>
    ),
  }),

  // Orgasmusfreie Zeit
  orgasmFree: block({
    load: async ({ userId }) => (await orgasmEntriesCached(userId))[0] ?? null,
    render: (lastOrgasmus, { now, t, dl, tz }) => lastOrgasmus ? (
      <Section title={t("orgasmFreeTime")}>
        {/* Die Dauer trägt die Zeile, das Datum steht leise darunter — dieselbe Ordnung wie beim
            Helden der Übersicht: erst die Antwort, dann der Beleg. */}
        <p className="text-kennzahl font-semibold text-foreground whitespace-nowrap tabular-nums">
          {formatDurationMs(now.getTime() - lastOrgasmus.startTime.getTime(), dl)}
        </p>
        <p className="text-neben text-foreground-faint">
          {t("lastOrgasm")}: {formatDateTime(lastOrgasmus.startTime, dl, tz)}
        </p>
      </Section>
    ) : (
      <Section title={t("orgasmFreeTime")}>
        <p className="text-fliess text-foreground-faint">{t("noEntry")}</p>
      </Section>
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
      <Section title={t("currentSession")}>
        {/* Die einzige farbige Zahl der Seite: sie beschreibt einen ZUSTAND, der gerade gilt.
            Was vorbei ist, steht daneben in Neutral. */}
        <p className="text-kennzahl font-semibold text-lock whitespace-nowrap tabular-nums">
          {formatDurationMs(now.getTime() - activeEntry.startTime.getTime(), dl)}
        </p>
        <p className="text-neben text-foreground-faint">
          {t("lockedSince")} {formatDateTime(activeEntry.startTime, dl, tz)}
        </p>
      </Section>
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
        <Section
          key={g.id}
          title={
            <span className="flex items-center gap-1.5 min-w-0">
              {/* Die Kategorie-Farbe sitzt im Zeichen, nicht auf einer Kachel dahinter: sie sagt
                  WELCHE Kategorie, und dafür genügt ein Zeichen. */}
              {style && g.icon && (
                <CategoryIconRender name={g.icon} className="size-3.5 shrink-0" style={{ color: style.color }} />
              )}
              <span className="truncate">{t("trainingGoalFor", { name: g.name })}</span>
            </span>
          }
          /* Kein „aktiv"-Abzeichen mehr: die Karte erscheint AUSSCHLIESSLICH für aktive Vorgaben
             (`activeVorgaben`). Ein Etikett, das immer dasselbe sagt, sagt nichts — und es trug
             ausgerechnet Koralle, die Farbe für „das will jetzt etwas von dir". */
        >
          <div className="flex flex-col gap-4">
            {GOAL_PERIODS.map((period) => {
              const target = g.goal.targetH[period];
              if (!target) return null;
              const actual = g.hours[period];
              return (
                <GoalBar key={period} label={t(GOAL_BAR_LABEL_KEY[period])} actual={actual} target={target}
                  sub={`${formatTotalHours(actual)} ${tc("of")} ${formatTotalHours(target)}`}
                  shareLabel={(percent) => t(GOAL_BAR_SHARE_KEY[period], { percent })}
                  reachedLabel={t("reached")} />
              );
            })}
            {g.notiz && <p className="text-neben text-foreground-muted italic">{g.notiz}</p>}
          </div>
        </Section>
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
      <Section title={t("records")}>
        <div className="divide-y divide-border-subtle">
          <RecordRow label={t("longestSession")} value={formatDurationMs(longest!.durationMs, dl)} sub={formatDateTime(longest!.verschluss.startTime, dl, tz)} />
          <RecordRow label={t("shortestSession")} value={formatDurationMs(shortest!.durationMs, dl)} sub={formatDateTime(shortest!.verschluss.startTime, dl, tz)} />
        </div>
      </Section>
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
      <Section title={t("inspections")}>
        <StatsKontrollenList rows={rows} />
      </Section>
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
      <Section
        title={
          <span className="flex items-center gap-1.5 text-warn">
            <ShieldAlert size={13} className="shrink-0" />
            {t("unlawfulOpenings")} ({openings.length})
          </span>
        }
      >
        {/* Die einzige Liste der Seite, die farbig bleiben DARF: unerlaubte Öffnungen sind
            Vergehen. Aber nur die Rubrik trägt die Farbe — stünde sie auch auf jeder Zeile,
            wäre sie wieder eine Sorten-Angabe statt eines Signals. */}
        <div className="divide-y divide-border-subtle">
          {openings.map((e) => (
            <div key={e.id} className={`${blockInsetCls} py-2.5 flex items-center gap-3`}>
              <span className="text-fliess tabular-nums text-foreground shrink-0">
                {formatDateTime(e.startTime, dl, tz)}
              </span>
              {e.note
                ? <span className="text-neben text-foreground-faint italic truncate">„{e.note}"</span>
                : <span className="text-neben text-foreground-faint">–</span>
              }
            </div>
          ))}
        </div>
      </Section>
    ),
  }),
};


// ── Bauteile der Blöcke ────────────────────────────────────────────────────────

function RecordRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${blockInsetCls} py-3`}>
      <div>
        <p className="text-fliess text-foreground">{label}</p>
        <p className="text-neben text-foreground-faint mt-0.5">{sub}</p>
      </div>
      <span className="text-fliess font-semibold text-foreground tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

/** Die Beschriftung je Periode auf dieser Karte — „Heute"/„Diese Woche" statt der kurzen
 *  `day`/`week` der Live-Zeilen. Eine Tabelle statt vier ausgeschriebener Balken-Blöcke: die Regel,
 *  WELCHER Balken erscheint, stand hier sonst ein viertes Mal. */
const GOAL_BAR_LABEL_KEY: Record<GoalPeriod, "today" | "thisWeek" | "thisMonth" | "thisYear"> = {
  day: "today", week: "thisWeek", month: "thisMonth", year: "thisYear",
};

/**
 * Der NENNER der Prozentzahl, je Periode — „46 % des Tagesziels" statt eines nackten „46 %".
 *
 * Dieselbe Tragezeit steht auf dem Dashboard ein zweites Mal, dort aber als Anteil der bisher
 * VERSTRICHENEN Tageszeit (`dashboard.coverageDay`). Beide Zahlen sind richtig, und sie sagen
 * Gegenteiliges: 100 % der bisherigen Tageszeit gegen 46 % des Tagesziels. Wer nur die Zahlen
 * liest, hält eine von beiden für einen Fehler — und im schlimmeren Fall die falsche für die
 * Erlaubnis, abzulegen. Die Regel dazu steht in `percent.ts`: eine Prozentzahl ohne ihren Nenner
 * ist unfertig, und wo die Umgebung ihn nicht ohnehin nennt, gehört er in die Beschriftung.
 *
 * Die Texte kommen wie bei `GoalProgressRow` als fertige Funktion von aussen — die Bauteile am
 * Ende dieser Datei haben keinen i18n-Zugang.
 */
const GOAL_BAR_SHARE_KEY: Record<GoalPeriod, "goalShareDay" | "goalShareWeek" | "goalShareMonth" | "goalShareYear"> = {
  day: "goalShareDay", week: "goalShareWeek", month: "goalShareMonth", year: "goalShareYear",
};

function GoalBar({ label, actual, target, sub, shareLabel, reachedLabel }: { label: string; actual: number; target: number; sub: string; shareLabel: (percent: number) => string; reachedLabel: string }) {
  const reached = actual >= target;
  // Bei 19h 58min von 20h rundet `goalPct` auf 100 — die Zeile schriebe „100 % des Tagesziels",
  // während „geschafft" ausbleibt und der Balken sichtbar nicht voll ist. Drei Angaben, zwei
  // Aussagen. Solange das Ziel nicht erreicht IST, wird deshalb abgeschnitten statt gerundet: 99
  // ist die höchste Zahl, die ein unerreichtes Ziel nennen darf.
  const roh = goalPct(actual, target) ?? 0;
  const pct = reached ? roh : Math.min(99, roh);
  return (
    <div>
      {/* Die Lage steht als WORT da, nicht als Abzeichen: „geschafft" oder der Prozentwert, in
          derselben Zeile wie die Beschriftung. Ein Pillen-Rahmen um zwei Zeichen ist der kleinste
          Kasten der App und trotzdem einer.

          Der Prozentwert nennt seinen Nenner mit („46 % des Tagesziels") — Begründung an
          `GOAL_BAR_SHARE_KEY`. „geschafft" braucht ihn nicht: das Wort bezieht sich auf das Ziel
          und auf nichts sonst. */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-fliess text-foreground">{label}</span>
        <span className={`text-neben font-semibold tabular-nums text-right ${reached ? "text-ok" : "text-foreground-faint"}`}>
          {reached ? reachedLabel : shareLabel(pct)}
        </span>
      </div>
      <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${reached ? "bg-ok" : "bg-border-strong"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-xs text-foreground-faint mt-1">{sub}</p>
    </div>
  );
}
