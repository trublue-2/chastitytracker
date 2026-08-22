import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ClipboardList, Droplets, ChevronRight } from "lucide-react";
import { block, type StackBlock } from "@/lib/blockStack";
import type { KeyholderSubBlockId } from "@/lib/dashboardBlockRegistry";
import {
  activeVorgabeCached, activeWearSessionsCached, deviceCountCached, entriesCached,
  keyholderInspectionsCached, keyholderOrgasmRequestCached, keyholderPairsCached,
  keyholderRunningSessionCached, keyholderSperrzeitCached, latestKgEntryCached, orgasmConfigCached,
  orgasmEntriesCached, sessionListDataCached, taskCardsCached, userRowCached, wearCountsCached,
  wearingHoursCached, wearSessionRowsCached,
} from "@/lib/dashboardData";
import { heimdallEnabled, orgasmusAnforderungArtLabel } from "@/lib/constants";
import { isScheduledDirective } from "@/lib/queries";
import { buildBoxReinigungView } from "@/lib/boxReinigung";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { ANFORDERUNG_PILLS, VERIFIKATION_PILLS } from "@/lib/kontrollePills";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";
import {
  formatDate, formatTime, formatDurationMs, formatTotalHours, formatTotalMs,
  interruptionPauseMs, isTimeCorrected,
} from "@/lib/utils";
import LaufendeSessionCard from "@/app/dashboard/LaufendeSessionCard";
import StatusBanner from "@/app/dashboard/StatusBanner";
import ActiveWearSessions from "@/app/dashboard/ActiveWearSessions";
import SessionList from "@/app/dashboard/SessionList";
import WearSessionList from "@/app/dashboard/WearSessionList";
import TaskList from "@/app/dashboard/TaskList";
import CategoryGoalsToday from "@/app/dashboard/CategoryGoalsToday";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import KontrolleItemListClient, { type KontrolleItemData } from "@/app/components/KontrolleItemListClient";
import OrgasmenListClient, { type OrgasmusItemData } from "@/app/components/OrgasmenListClient";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import TaskCardStack from "@/app/components/TaskCardStack";
import KeyholderTaskCard from "@/app/admin/tasks/KeyholderTaskCard";
import WithdrawButton from "@/app/admin/WithdrawButton";
import BoxStatusCard from "@/app/components/BoxStatusCard";
import Card from "@/app/components/Card";

/**
 * **Die Blöcke der Keyholder-Detailseite — je mit eigener Datenbeschaffung.**
 *
 * Ihr Gegenstück ist das Träger-Dashboard, und die Karten sind zum grossen Teil dieselben. Was sie
 * unterscheidet, steckt im Kontext: **hier sind Betrachter und Betrachteter zwei Personen.**
 * Deshalb heissen die Felder `subject…` und `viewer…` statt `userId` und `tz` — auf den
 * Träger-Oberflächen fallen beide zusammen, hier nicht, und ein Block, der das verwechselt, zeigt
 * Fristen in der falschen Zeitzone.
 */

export interface KeyholderSubCtx {
  /** Der TRÄGER, dessen Daten die Seite zeigt. */
  subjectId: string;
  now: Date;
  nowMs: number;
  /** Die Zone des Trägers — sie regiert jede Tagesgrenze und jede Frist. */
  subjectTz: string;
  /** Die Zone der Keyholderin. Fristen tragen beide, sonst plant sie um den Versatz falsch. */
  viewerTz: string;
  dl: string;
  /** Beschriftet die Sub-Zeit im Zwei-Zonen-Zeitstempel. */
  subLabel: string;
  /** Zeitstempel in Betrachter-Zeit, mit der Sub-Zeit als Zusatz bei Abweichung. */
  fmtDual: (d: Date) => string;
  t: Awaited<ReturnType<typeof getTranslations<"admin">>>;
  ts: Awaited<ReturnType<typeof getTranslations<"stats">>>;
  td: Awaited<ReturnType<typeof getTranslations<"dashboard">>>;
  tc: Awaited<ReturnType<typeof getTranslations<"common">>>;
  tOrgasm: Awaited<ReturnType<typeof getTranslations<"orgasmForm">>>;
  tTasks: Awaited<ReturnType<typeof getTranslations<"tasks">>>;
}

/** Kürzel für die geteilte Herleitung — `audience` entscheidet über Umfang UND Deep-Links. */
const taskCardsOf = (ctx: KeyholderSubCtx) =>
  taskCardsCached(ctx.subjectId, ctx.nowMs, ctx.tTasks("requirementKgLocked"), "keyholder");

/**
 * Die Sperrzeit, die für die REINIGUNGS-Frage zählt.
 *
 * `getKeyholderSperrzeit` zeigt auch eine erst GEPLANTE (damit die Keyholderin sie stornieren
 * kann) — hier zählt nur die bereits wirksame, sonst meldet die Box-Karte „durch Sperrzeit
 * blockiert", bevor die Sperre überhaupt läuft.
 *
 * Das Ergebnis ist dasselbe, das `getActiveSperrzeit` liefern würde; abgeleitet statt abgefragt,
 * weil die Seite die Keyholder-Zeilen ohnehin geladen hat und eine zweite Runde nichts brächte.
 */
async function effectiveSperrzeit(ctx: KeyholderSubCtx) {
  const sperre = await keyholderSperrzeitCached(ctx.subjectId);
  return sperre && !isScheduledDirective(sperre.wirksamAb, ctx.now) ? sperre : null;
}

export const KEYHOLDER_SUB_BLOCK_TABLE: Record<KeyholderSubBlockId, StackBlock<KeyholderSubCtx>> = {
  // Dieselbe Karte wie im Sub-Dashboard, an derselben Stelle (zuoberst): die Keyholderin sah den
  // Box-Zustand bisher nirgends — weder Ist/Soll noch, ob die Box überhaupt noch funkt.
  boxStatus: block({
    load: async (ctx) => {
      if (!heimdallEnabled()) return null;
      // Das Tageskontingent zählt aus den ohnehin geladenen Einträgen — ohne eigene DB-Runde. Nur
      // der Schlüssel-Nachweis aus der Telemetrie fragt noch ab, damit die Keyholderin dieselben
      // Pillen sieht wie der Sub.
      const [user, entries, sperre] = await Promise.all([
        userRowCached(ctx.subjectId), entriesCached(ctx.subjectId), effectiveSperrzeit(ctx),
      ]);
      return buildBoxReinigungView(user, entries, sperre, ctx.now, ctx.subjectTz);
    },
    render: (reinigung, { subjectId, subjectTz, viewerTz }) => heimdallEnabled() && (
      <BoxStatusCard userId={subjectId} tz={subjectTz} viewerTz={viewerTz} reinigung={reinigung} />
    ),
  }),

  // Aufgaben an derselben Stelle wie beim Sub — über der Session-Karte. Eine Aufgabe mit Frist ist
  // das Einzige hier, das in den nächsten Stunden zu einem Vergehen werden kann.
  tasks: block({
    load: async (ctx) => (await taskCardsOf(ctx)).open,
    render: (cards, { viewerTz, subjectTz }) => (
      <TaskCardStack>
        {cards.map((card) => (
          <KeyholderTaskCard key={card.id} task={card} viewerTz={viewerTz} subTz={subjectTz} />
        ))}
      </TaskCardStack>
    ),
  }),

  sessionOrStatus: block({
    load: async ({ subjectId, nowMs, dl, subjectTz }) => {
      const running = await keyholderRunningSessionCached(subjectId, nowMs, dl);
      // Läuft keine Session, steht hier nur der Status-Balken — dann braucht es weder Ziele noch
      // Stundenrechnung. Letztere paart die ganze Historie und wird von keinem anderen Block
      // dieser Seite gebraucht.
      if (!running) return { running: null, latest: await latestKgEntryCached(subjectId) };
      const [sperrzeit, activeVorgabe, hours, deviceCount] = await Promise.all([
        keyholderSperrzeitCached(subjectId), activeVorgabeCached(subjectId, nowMs),
        wearingHoursCached(subjectId, nowMs, subjectTz), deviceCountCached(subjectId),
      ]);
      return { running, sperrzeit, activeVorgabe, hours, deviceCount, latest: null };
    },
    render: (data, { now, subjectTz, t }) =>
      data.running ? (
        <LaufendeSessionCard
          sessionStart={data.running.activePair.verschluss.startTime}
          interruptionPausedMs={interruptionPauseMs(data.running.activePair.interruptions)}
          now={now}
          events={data.running.events}
          sperrzeitEndetAt={data.sperrzeit?.endetAt ?? null}
          // Unbefristet ist unbefristet — auch wenn die Sperre terminiert wurde. Die frühere
          // Zusatzbedingung `!wirksamAb` liess bei einer TERMINIERTEN unbefristeten Sperre alle
          // drei Sperr-Angaben leer laufen, und damit verschwand die ganze Zeile aus IHRER Karte,
          // während der Träger sie sah.
          sperrzeitUnbefristet={!!data.sperrzeit && data.sperrzeit.endetAt === null}
          sperrzeitNachricht={data.sperrzeit?.nachricht ?? null}
          sperrzeitScheduledFor={data.sperrzeit?.wirksamAb && data.sperrzeit.wirksamAb > now ? data.sperrzeit.wirksamAb : null}
          // Der erreichte Beginn — die Karte zeigt ihn nur, wo sonst kein Zeitpunkt stünde.
          sperrzeitRunningSince={data.sperrzeit?.wirksamAb && data.sperrzeit.wirksamAb <= now ? data.sperrzeit.wirksamAb : null}
          // Keyholder-Sicht: IMMER die Eigenschaft der Sperre, unabhängig von den Benutzer-
          // Einstellungen des Subs — sie hat das Flag gesetzt und prüft es hier.
          cleaningNote={data.sperrzeit ? t(data.sperrzeit.reinigungErlaubt ? "sperrzeitWithCleaning" : "sperrzeitWithoutCleaning") : null}
          keyInBox={data.running.activePair.verschluss.keyInBox ?? null}
          activeVorgabe={data.activeVorgabe ? proratedVorgabeTargets(data.activeVorgabe, now, subjectTz) : null}
          tagH={data.hours.tagH}
          wocheH={data.hours.wocheH}
          monatH={data.hours.monatH}
          jahrH={data.hours.jahrH}
          tz={subjectTz}
          userHasDevices={data.deviceCount > 0}
        />
      ) : (
        <StatusBanner
          type={data.latest ? (data.latest.type as "VERSCHLUSS" | "OEFFNEN") : null}
          since={data.latest?.startTime.toISOString() ?? null}
          tz={subjectTz}
        />
      ),
  }),

  wearSessions: block({
    load: ({ subjectId }) => activeWearSessionsCached(subjectId),
    render: (sessions, { now, subjectId }) => sessions.length > 0 && (
      <ActiveWearSessions
        sessions={sessions.map((s) => ({
          categoryId: s.categoryId,
          categoryName: s.categoryName,
          categoryColor: s.categoryColor,
          categoryIcon: s.categoryIcon,
          deviceName: s.deviceName,
          since: s.since.toISOString(),
          imageUrl: s.imageUrl,
        }))}
        serverNow={now.toISOString()}
        adminUserId={subjectId}
      />
    ),
  }),

  openInspection: block({
    // Aktiv offene Kontrolle für das grosse Banner — geplante (wirksamAb in der Zukunft)
    // ausschliessen: die erscheinen unten in der Kontroll-Liste mit „geplant"-Pill, nicht als
    // aktiver Alarm.
    load: async ({ subjectId, nowMs, now }) =>
      (await keyholderInspectionsCached(subjectId, nowMs)).find(
        (k) => !k.entryId && !k.withdrawnAt && !isScheduledDirective(k.wirksamAb, now),
      ) ?? null,
    render: (offeneKontrolle, { now, subjectTz, viewerTz }) => offeneKontrolle && (
      <KontrolleBanner
        deadline={offeneKontrolle.deadline}
        code={offeneKontrolle.code}
        kommentar={offeneKontrolle.kommentar}
        target={inspectionTargetLabel(offeneKontrolle)}
        overdue={offeneKontrolle.deadline < now}
        variant="large"
        tz={subjectTz}
        viewerTz={viewerTz}
      />
    ),
  }),

  orgasmRequest: block({
    load: ({ subjectId }) => keyholderOrgasmRequestCached(subjectId),
    render: (anforderung, { now, dl, subjectTz, viewerTz, subLabel, t, fmtDual }) => anforderung && (() => {
      // Eine noch nicht ausgelöste Anweisung bleibt SICHTBAR (die Keyholderin hat sie gestellt und
      // muss sie zurückziehen können), aber sie läuft nicht: kein Countdown auf ein Fenster, das
      // der Träger nicht kennt, und die Beschriftung sagt, wann sie kommt.
      const scheduled = isScheduledDirective(anforderung.wirksamAb, now);
      const expired = !scheduled && anforderung.endetAt < now;
      return (
        <LockRequestBanner
          variant="compact"
          colorScheme="orgasm"
          label={
            orgasmusAnforderungArtLabel(anforderung.art as "ANWEISUNG" | "GELEGENHEIT", t)
            + (expired ? ` · ${t("orgasmAnforderungExpired")}` : "")
            + (scheduled ? ` · ${t("orgasmAnforderungScheduled", { time: fmtDual(anforderung.wirksamAb!) })}` : "")
          }
          overdue={expired}
          endetAt={scheduled ? null : anforderung.endetAt}
          locale={dl}
          tz={subjectTz}
          viewerTz={viewerTz}
          subTimePrefix={subLabel}
          withdrawAction={<WithdrawButton id={anforderung.id} apiPath="/api/admin/orgasmus-anforderung" title={t("withdrawOrgasmTitle")} colorToken="orgasm" />}
        />
      );
    })(),
  }),

  // Statistik kompakt. Gezählt wird nach `wearCountsCached` — derselben Regel wie auf der
  // Statistik-Seite; bis v5.3.1 zählten die beiden Karten verschieden.
  statsCompact: block({
    load: async ({ subjectId, now }) => {
      const [counts, orgasmusEntries] = await Promise.all([
        wearCountsCached(subjectId), orgasmEntriesCached(subjectId),
      ]);
      const lastOrgasmus = orgasmusEntries[0] ?? null;
      return {
        ...counts,
        lastOrgasmus,
        orgasmusFreiMs: lastOrgasmus ? now.getTime() - lastOrgasmus.startTime.getTime() : null,
      };
    },
    render: (data, { subjectId, dl, t, ts, fmtDual }) => {
      const orgasmusFreiDisplay = data.orgasmusFreiMs ? formatDurationMs(data.orgasmusFreiMs, dl) : null;
      return (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("statsTitle")}</p>
            <Link href={`/admin/users/${subjectId}/stats`} className="text-xs text-foreground-faint hover:text-foreground-muted transition">
              {t("allStats")} →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-raised px-4 py-3">
              <p className="text-xs text-foreground-faint mb-0.5">{ts("entries")}</p>
              <p className="text-2xl font-bold text-foreground tracking-tight">{data.sessions}</p>
            </div>
            <div className="rounded-xl bg-surface-raised px-4 py-3">
              <p className="text-xs text-foreground-faint mb-0.5">{ts("totalDuration")}</p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {data.closed ? formatTotalMs(data.totalMs) : "–"}
              </p>
            </div>
            {orgasmusFreiDisplay !== null && (
              <div className="rounded-xl bg-orgasm-bg border border-orgasm-border px-4 py-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-orgasm-text font-semibold mb-0.5 uppercase tracking-wider">{ts("orgasmFreeTime")}</p>
                <p className="text-2xl font-bold text-orgasm tracking-tight">{orgasmusFreiDisplay}</p>
                {data.lastOrgasmus && <p className="text-xs text-orgasm-text opacity-60 mt-0.5">{ts("lastOrgasm")}: {fmtDual(data.lastOrgasmus.startTime)}</p>}
              </div>
            )}
          </div>
        </Card>
      );
    },
  }),

  goalOverview: block({
    load: ({ subjectId, nowMs }) => activeVorgabeCached(subjectId, nowMs),
    render: (activeVorgabe, { subjectId, subjectTz, dl, t, ts, tc, td }) => activeVorgabe && (
      <Card>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{ts("trainingGoals")}</p>
          <Link href={`/admin/users/${subjectId}/einstellungen`} className="text-xs text-foreground-faint hover:text-foreground-muted transition flex items-center gap-0.5">
            {tc("all")} <ChevronRight size={12} />
          </Link>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-xs font-bold text-request-text bg-request-bg border border-request-border px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0">{t("vorgabeActive")}</span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {formatDate(activeVorgabe.gueltigAb, dl, subjectTz)} → {activeVorgabe.gueltigBis ? formatDate(activeVorgabe.gueltigBis, dl, subjectTz) : tc("open")}
            </p>
            <div className="flex flex-wrap gap-3 mt-1">
              {activeVorgabe.minProTagH != null && <span className="text-xs text-foreground-muted">{td("day")}: <strong className="text-foreground">{formatTotalHours(activeVorgabe.minProTagH)}</strong></span>}
              {activeVorgabe.minProWocheH != null && <span className="text-xs text-foreground-muted">{td("week")}: <strong className="text-foreground">{formatTotalHours(activeVorgabe.minProWocheH)}</strong></span>}
              {activeVorgabe.minProMonatH != null && <span className="text-xs text-foreground-muted">{td("month")}: <strong className="text-foreground">{formatTotalHours(activeVorgabe.minProMonatH)}</strong></span>}
            </div>
            {activeVorgabe.notiz && <p className="text-xs text-foreground-faint italic mt-0.5">{activeVorgabe.notiz}</p>}
          </div>
        </div>
      </Card>
    ),
  }),

  // Ohne Prop-Werk: die Karte lädt ihre Kategorie-Ziele selbst — hier ohne Live-Ticken, weil die
  // Keyholderin keine laufenden Sessions mitzählen lässt.
  categoryGoals: async ({ subjectId }) => <CategoryGoalsToday userId={subjectId} />,

  sessionList: block({
    load: ({ subjectId, nowMs }) => sessionListDataCached(subjectId, nowMs, "keyholder"),
    render: (data, { subjectTz }) => (
      <SessionList
        keyholderView
        pairs={data.pairs}
        orgasmusEntries={data.orgasmusEntries}
        userHasDevices={data.deviceCount > 0}
        tz={subjectTz}
        orgasmusArtenConfig={data.user?.orgasmusArtenConfig}
        oeffnenGruendeConfig={data.user?.oeffnenGruendeConfig}
        telemetryKeyProof={data.telemetryKeyProof}
      />
    ),
  }),

  wearSessionList: block({
    load: ({ subjectId, nowMs, dl }) => wearSessionRowsCached(subjectId, nowMs, dl),
    render: (rows) => rows.length > 0 && <WearSessionList sessions={rows} />,
  }),

  // Dieselbe Liste wie im Sub-Dashboard, an derselben Stelle: unten bei den Historien. Fristen
  // stehen wie überall sonst auf dieser Seite in BEIDEN Zeitzonen — die Sub-Zeit trägt dazu ihr
  // Präfix, sonst wechselte mitten in der Spalte stumm die Uhr.
  taskList: block({
    load: async (ctx) => (await taskCardsOf(ctx)).all,
    render: (tasks, { subjectTz, viewerTz, subLabel }) => (
      <TaskList tasks={tasks} tz={subjectTz} viewerTz={viewerTz} subLabel={subLabel} />
    ),
  }),

  inspectionHistory: block({
    load: async ({ subjectId, nowMs }) => (await keyholderPairsCached(subjectId, nowMs)).items,
    render: (kontrollItems, { subjectId, t, ts, tc, fmtDual }) => kontrollItems.length > 0 && (
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
            <ClipboardList size={12} />{ts("inspections")}
          </p>
          <Link href={`/admin/users/${subjectId}/kontrollen`} className="text-xs text-foreground-faint hover:text-foreground-muted transition flex items-center gap-0.5">
            {tc("all")} <ChevronRight size={12} />
          </Link>
        </div>
        <KontrolleItemListClient
          imageAlt={ts("inspections")}
          items={[...kontrollItems].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5).map((k): KontrolleItemData => {
            const aPill = k.anforderungStatus ? ANFORDERUNG_PILLS[k.anforderungStatus] : null;
            const vPill = k.verifikationStatus ? VERIFIKATION_PILLS[k.verifikationStatus] : null;
            return {
              id: k.id, imageUrl: k.imageUrl, boxImageUrl: k.boxImageUrl, kommentar: k.kommentar,
              pill1Label: aPill ? t(aPill.labelKey) : null, pill1Cls: aPill?.cls ?? null,
              pill2Label: vPill ? t(vPill.labelKey) : null, pill2Cls: vPill?.cls ?? null,
              code: k.code, dateTimeStr: fmtDual(k.time), dateTimePrefix: null,
              deadlineStr: k.deadline ? fmtDual(k.deadline) : null,
              deadlinePrefix: t("frist"), note: null, entryId: k.entryId,
              editHref: k.entryId ? `/dashboard/edit/${k.entryId}?from=admin&userId=${subjectId}` : null,
              timeCorrectedStr: isTimeCorrected(k.time, k.submittedAt)
                ? `${t("timeCorrected")} – ${t("givenLabel")}: ${fmtDual(k.time)} · ${t("systemLabel")}: ${fmtDual(k.submittedAt!)}`
                : null,
            };
          })}
        />
      </Card>
    ),
  }),

  orgasmList: block({
    load: async ({ subjectId }) => {
      const [orgasmusEntries, orgasmCfg] = await Promise.all([
        orgasmEntriesCached(subjectId), orgasmConfigCached(subjectId),
      ]);
      return { orgasmusEntries, orgasmCfg };
    },
    render: ({ orgasmusEntries, orgasmCfg }, { subjectId, subjectTz, dl, td, tOrgasm }) => orgasmusEntries.length > 0 && (
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
            <Droplets size={12} />{td("orgasms")}
          </p>
        </div>
        <OrgasmenListClient
          items={orgasmusEntries.slice(0, 5).map((e): OrgasmusItemData => ({
            id: e.id,
            dateStr: formatDate(e.startTime, dl, subjectTz),
            timeStr: formatTime(e.startTime, dl, subjectTz),
            orgasmusArt: resolveOrgasmusArtDisplay(e.orgasmusArt, orgasmCfg, tOrgasm),
            note: e.note,
            editHref: `/dashboard/edit/${e.id}?from=admin&userId=${subjectId}`,
          }))}
        />
      </Card>
    ),
  }),
};
