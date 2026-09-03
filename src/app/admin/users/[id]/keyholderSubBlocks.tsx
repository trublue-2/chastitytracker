import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ClipboardList, Droplets, ChevronRight } from "lucide-react";
import { block, type StackBlock } from "@/lib/blockStack";
import type { KeyholderSubBlockId } from "@/lib/dashboardBlockRegistry";
import {
  activeVorgabeCached, activeWearSessionsCached, deviceCountCached,
  keyholderInspectionsCached, keyholderOrgasmRequestCached, keyholderPairsCached,
  keyholderRunningSessionCached, keyholderLockPeriodCached, latestKeyInBoxCached, latestKgEntryCached, orgasmConfigCached,
  orgasmEntriesCached, sessionListDataCached, taskCardsCached, wearCountsCached,
  wearingHoursCached, wearSessionRowsCached,
} from "@/lib/dashboardData";
import { heimdallEnabled, orgasmusAnforderungArtLabel } from "@/lib/constants";
import { getIsLocked, isScheduledDirective } from "@/lib/queries";
import { currentOrNextCleaningWindow, type NextCleaningWindow } from "@/lib/cleaningService";
import { datedWindowLabel } from "@/lib/weekdays";
import { buildWeekdayLabels } from "@/lib/statsBuilders";
import { userRowCached } from "@/lib/dashboardData";
import { resolveGoalTargets } from "@/lib/goalFulfillment";
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
import Section from "@/app/components/Section";
import StatsCard from "@/app/components/StatsCard";
import { getOffenseRules } from "@/lib/offenseRulesService";

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
 * „mit Reinigung" — und, wo Fenster gesetzt sind, ab wann.
 *
 * IHRE Formulierung, nicht die des Trägers: hier steht die Eigenschaft der SPERRE, unabhängig von
 * den Benutzer-Einstellungen des Subs (sie hat das Flag gesetzt und prüft es hier). Die Uhrzeit
 * kommt trotzdem aus derselben Quelle wie auf seiner Übersicht — sonst fände sie die Fenster, die
 * er dort liest, nur noch im Einstellungs-Formular.
 */
function cleaningAttributeNote(
  lockPeriod: { cleaningAllowed: boolean } | null | undefined,
  window: NextCleaningWindow | null,
  dl: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  if (!lockPeriod) return null;
  if (!lockPeriod.cleaningAllowed) return t("sperrzeitWithoutCleaning");
  if (!window) return t("sperrzeitWithCleaning");
  return t("sperrzeitWithCleaningWindow", { window: datedWindowLabel(window, buildWeekdayLabels(dl), t("windowInAWeek")) });
}

export const KEYHOLDER_SUB_BLOCK_TABLE: Record<KeyholderSubBlockId, StackBlock<KeyholderSubCtx>> = {
  // Dieselbe Karte wie im Sub-Dashboard, an derselben Stelle (zuoberst): die Keyholderin sah den
  // Box-Zustand bisher nirgends — weder Ist/Soll noch, ob die Box überhaupt noch funkt.
  boxStatus: block({
    load: async (ctx) => {
      if (!heimdallEnabled()) return null;
      const [wearerLocked, keyInBox] = await Promise.all([
        // Siehe `dashboardBlocks`: ohne den Träger-Zustand liesse sich „Riegel zu, obwohl niemand
        // verschlossen ist" nicht vom Normalfall unterscheiden.
        getIsLocked(ctx.subjectId),
        // Und ohne den Schlüssel-Zustand widerspräche diese Karte der eigenen Übersicht der
        // Keyholderin: `/admin` nimmt den Reisefall aus, hier fehlte er.
        latestKeyInBoxCached(ctx.subjectId),
      ]);
      return { wearerLocked, keyInBox };
    },
    render: (data, { subjectId }) => heimdallEnabled() && data !== null && (
      <BoxStatusCard userId={subjectId} wearerLocked={data.wearerLocked} keyInBox={data.keyInBox} />
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
    load: async ({ subjectId, nowMs, now, dl, subjectTz }) => {
      const running = await keyholderRunningSessionCached(subjectId, nowMs, dl);
      // Läuft keine Session, steht hier nur der Status-Balken — dann braucht es weder Ziele noch
      // Stundenrechnung. Letztere paart die ganze Historie und wird von keinem anderen Block
      // dieser Seite gebraucht.
      if (!running) return { running: null, latest: await latestKgEntryCached(subjectId) };
      const [lockPeriod, activeVorgabe, hours, deviceCount, offenseRules, user] = await Promise.all([
        keyholderLockPeriodCached(subjectId), activeVorgabeCached(subjectId, nowMs),
        wearingHoursCached(subjectId, nowMs, subjectTz), deviceCountCached(subjectId),
        // Ob ein früheres Öffnen geahndet wird, ist je Sub schaltbar — und SIE hat den Schalter.
        // Ohne diese Abfrage läse die Keyholderin auf ihrer eigenen Karte, dass eine Regel gilt,
        // die sie gerade selbst abgeschaltet hat.
        getOffenseRules(subjectId, now),
        // Für das Reinigungsfenster in ihrer Sperrzeit-Zeile. Eine gecachte Ein-Zeilen-Abfrage —
        // und die Alternative wäre, dass die Keyholderin die Uhrzeiten, die der Träger auf SEINER
        // Übersicht liest, nur noch im Einstellungs-Formular findet.
        userRowCached(subjectId),
      ]);
      // Fertig übersetzt schon hier: die Zeichenkette liegt im `dashboard`-Namensraum, den der
      // Seiten-Kontext nicht führt (er trägt `admin`). Die Karte bekommt sie als Text — dieselbe
      // Konvention wie `cleaningNote`, und sie hält die Regel-Kenntnis beim Aufrufer.
      const tDash = await getTranslations("dashboard");
      const lockBreakNote = offenseRules.unauthorized_opening === "off"
        ? null
        : tDash(lockPeriod?.cleaningAllowed ? "sessionLockedConsequenceCleaning" : "sessionLockedConsequence");
      // Das geltende Fenster, wo die Sperre Reinigung zulässt — dieselbe Auskunft wie auf der
      // Übersicht des Trägers, in IHRER Formulierung („mit Reinigung"). Ohne konfigurierte Fenster
      // bleibt es beim blossen Attribut: die Reinigung ist dann nicht zeitgebunden.
      const cleaningWindow = lockPeriod?.cleaningAllowed
        ? currentOrNextCleaningWindow(user?.cleaningWindows, now, subjectTz)
        : null;
      return { running, lockPeriod, activeVorgabe, hours, deviceCount, lockBreakNote, cleaningWindow, latest: null };
    },
    render: (data, { now, subjectTz, viewerTz, subLabel, subjectId, dl, t }) =>
      data.running ? (
        <LaufendeSessionCard
          // Zwei Zonen für die Sperr-Frist und die Box DIESES Subs: die Karte zeigte die Frist
          // unbeschriftet in Sub-Zeit, während die Box-Zeile darüber denselben Augenblick
          // zweizonig nannte.
          viewerTz={viewerTz}
          subLabel={subLabel}
          subjectId={subjectId}
          sessionStart={data.running.activePair.verschluss.startTime}
          interruptionPausedMs={interruptionPauseMs(data.running.activePair.interruptions)}
          now={now}
          events={data.running.events}
          lockPeriodEndsAt={data.lockPeriod?.endsAt ?? null}
          // Unbefristet ist unbefristet — auch wenn die Sperre terminiert wurde. Die frühere
          // Zusatzbedingung `!wirksamAb` liess bei einer TERMINIERTEN unbefristeten Sperre alle
          // drei Sperr-Angaben leer laufen, und damit verschwand die ganze Zeile aus IHRER Karte,
          // während der Träger sie sah.
          lockPeriodIndefinite={!!data.lockPeriod && data.lockPeriod.endsAt === null}
          lockPeriodMessage={data.lockPeriod?.message ?? null}
          lockPeriodScheduledFor={data.lockPeriod?.wirksamAb && data.lockPeriod.wirksamAb > now ? data.lockPeriod.wirksamAb : null}
          // Der erreichte Beginn — die Karte zeigt ihn nur, wo sonst kein Zeitpunkt stünde.
          lockPeriodRunningSince={data.lockPeriod?.wirksamAb && data.lockPeriod.wirksamAb <= now ? data.lockPeriod.wirksamAb : null}
          // Keyholder-Sicht: IMMER die Eigenschaft der Sperre, unabhängig von den Benutzer-
          // Einstellungen des Subs — sie hat das Flag gesetzt und prüft es hier.
          cleaningNote={cleaningAttributeNote(data.lockPeriod, data.cleaningWindow, dl, t)}
          // Nur wenn die Regel gilt, und mit der Reinigungs-Ausnahme im Text, wo die Sperre sie
          // zulässt (Herleitung in der Ladefunktion).
          lockBreakNote={data.lockBreakNote}
          keyInBox={data.running.activePair.verschluss.keyInBox ?? null}
          activeVorgabe={data.activeVorgabe ? resolveGoalTargets(data.activeVorgabe, now, subjectTz) : null}
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
    render: (offeneKontrolle, { now, subjectTz, viewerTz, t }) => offeneKontrolle && (
      <KontrolleBanner
        deadline={offeneKontrolle.deadline}
        target={inspectionTargetLabel(offeneKontrolle)}
        overdue={offeneKontrolle.deadline < now}
        variant="large"
        tz={subjectTz}
        viewerTz={viewerTz}
        // Beschriftet, nicht nur das Zeichen: `showLabel` gibt es genau für diesen Fall — an einem
        // Block ist ein 16-px-Symbol ohne Wort keine erkennbare Aktion. `inspect` auch bei
        // überfällig: der Rückzug ändert seine Bedeutung nicht, wenn die Frist reisst, und rot
        // gefärbt läse er sich wie eine Strafe.
        withdrawAction={
          <WithdrawButton
            id={offeneKontrolle.id}
            apiPath="/api/admin/kontrollen"
            title={t("withdrawKontrolleTitle")}
            showLabel
            colorToken="inspect"
          />
        }
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
      const expired = !scheduled && anforderung.endsAt < now;
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
          endsAt={scheduled ? null : anforderung.endsAt}
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
        // Drei Zahlen, drei Kacheln, eine Karte drumherum — vier Kästen für drei Werte. Jetzt
        // tragen die Zahlen selbst, und `StatsCard` ist dasselbe Bauteil wie auf der
        // Statistik-Seite: dieselbe Grösse für dieselbe Art Angabe, egal wer hinschaut.
        <Section
          title={t("statsTitle")}
          action={
            <Link href={`/admin/users/${subjectId}/stats`} className="text-neben text-foreground-faint hover:text-foreground-muted transition">
              {t("allStats")} →
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <StatsCard label={ts("entries")} value={String(data.sessions)} />
            <StatsCard label={ts("totalDuration")} value={data.closed ? formatTotalMs(data.totalMs) : "–"} />
            {orgasmusFreiDisplay !== null && (
              <div className="col-span-2 sm:col-span-1">
                <StatsCard label={ts("orgasmFreeTime")} value={orgasmusFreiDisplay} />
                {data.lastOrgasmus && (
                  <p className="text-neben text-foreground-faint mt-0.5">{ts("lastOrgasm")}: {fmtDual(data.lastOrgasmus.startTime)}</p>
                )}
              </div>
            )}
          </div>
        </Section>
      );
    },
  }),

  goalOverview: block({
    load: ({ subjectId, nowMs }) => activeVorgabeCached(subjectId, nowMs),
    render: (activeVorgabe, { subjectId, subjectTz, dl, t, ts, tc, td }) => activeVorgabe && (
      <Section
        title={ts("trainingGoals")}
        action={
          <Link href={`/admin/users/${subjectId}/einstellungen`} className="text-neben text-foreground-faint hover:text-foreground-muted transition inline-flex items-center gap-0.5">
            {tc("all")} <ChevronRight size={12} />
          </Link>
        }
      >
        <div className="flex items-start gap-3">
          <span className="text-neben font-semibold text-foreground-muted mt-0.5 flex-shrink-0">{t("vorgabeActive")}</span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {formatDate(activeVorgabe.gueltigAb, dl, subjectTz)} → {activeVorgabe.gueltigBis ? formatDate(activeVorgabe.gueltigBis, dl, subjectTz) : tc("open")}
            </p>
            <div className="flex flex-wrap gap-3 mt-1">
              {activeVorgabe.minProTagH != null && <span className="text-xs text-foreground-muted">{td("day")}: <strong className="text-foreground">{formatTotalHours(activeVorgabe.minProTagH)}</strong></span>}
              {activeVorgabe.minProWocheH != null && <span className="text-xs text-foreground-muted">{td("week")}: <strong className="text-foreground">{formatTotalHours(activeVorgabe.minProWocheH)}</strong></span>}
              {activeVorgabe.minProMonatH != null && <span className="text-xs text-foreground-muted">{td("month")}: <strong className="text-foreground">{formatTotalHours(activeVorgabe.minProMonatH)}</strong></span>}
            </div>
            {activeVorgabe.notiz && <p className="text-neben text-foreground-faint italic mt-0.5">{activeVorgabe.notiz}</p>}
          </div>
        </div>
      </Section>
    ),
  }),

  // Ohne Prop-Werk: die Karte lädt ihre Kategorie-Ziele selbst — hier ohne Live-Ticken, weil die
  // Keyholderin keine laufenden Sessions mitzählen lässt.
  categoryGoals: async ({ subjectId, subjectTz }) => <CategoryGoalsToday userId={subjectId} tz={subjectTz} />,

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
      <Section
        title={<span className="flex items-center gap-1.5"><ClipboardList size={12} />{ts("inspections")}</span>}
        action={
          <Link href={`/admin/users/${subjectId}/kontrollen`} className="text-neben text-foreground-faint hover:text-foreground-muted transition inline-flex items-center gap-0.5">
            {tc("all")} <ChevronRight size={12} />
          </Link>
        }
      >
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
      </Section>
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
      <Section title={<span className="flex items-center gap-1.5"><Droplets size={12} />{td("orgasms")}</span>}>
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
      </Section>
    ),
  }),
};
