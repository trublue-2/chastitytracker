import { Suspense } from "react";
import { getIsLocked } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { block, type StackBlock } from "@/lib/blockStack";
import { weightReleaseStatus } from "@/lib/weightReleaseService";
import type { UnitSystem } from "@/lib/weight";
import type { SubDashboardBlockId } from "@/lib/dashboardBlockRegistry";
import type { ResolvedLayout } from "@/lib/dashboardLayout";
import {
  activeVorgabeCached, activeWearCategoryIdsCached, activeWearSessionsCached, cleaningRulesCached,
  deviceCountCached, entriesCached, evaluatedTasksCached, latestKeyInBoxCached, latestKgEntryCached, lockRequestCached,
  orgasmConfigCached, pendingLockCached, sessionListDataCached, subOrgasmRequestCached, subRunningSessionCached,
  subLockPeriodCached, subVisibleInspectionsNow, taskCardsCached, trackingCategoriesCached,
  userRowCached, wearingHoursCached, wearSessionRowsCached, wearSessionsCached,
} from "@/lib/dashboardData";
import { deviceCategoriesEnabled, heimdallEnabled } from "@/lib/constants";
import { predictAutoMarkAt } from "@/lib/inspectionEscalationService";
import { cleaningPermissionUserAt } from "@/lib/cleaningRules";
import { cleaningRelockObligation, cleaningWindowEnforcedFrom } from "@/lib/strafbuch";
import {
  formatDateTime, formatTime, interruptionPauseMs, runningCleaningPauseUntil,
  getMidnightToday, getWeekStart, getMonthStart, wearingHoursFromPairs, joinParts,
} from "@/lib/utils";
import { wearHourPairsByCategory } from "@/lib/sessionModel";
import { resolveGoalTargets, buildKgGoalRow } from "@/lib/goalFulfillment";
import type { Translate } from "@/lib/boxStatus";
import { currentOrNextCleaningWindow } from "@/lib/cleaningService";
import { datedWindowLabel } from "@/lib/weekdays";
import { buildWeekdayLabels } from "@/lib/statsBuilders";
import { resolveReasonLabel } from "@/lib/reasonsService";
import { categoryNeedsDevice } from "@/lib/categoryConstants";
import { inspectionHref, openInspections } from "@/lib/entryFormRoute";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";
import { belongsOnDashboard, isHeldByTask } from "@/lib/taskIntervals";
import DashboardClient, { type DashboardProps } from "./DashboardClient";
import DashboardAlerts, { type DashboardAlertsProps } from "./DashboardAlerts";
import OpenTasks from "./OpenTasks";
import OpenPenalties from "./OpenPenalties";
import TaskList from "./TaskList";
import LaufendeSessionCard from "./LaufendeSessionCard";
import OpenStateHero from "./OpenStateHero";
import SessionList from "./SessionList";
import WearSessionList from "./WearSessionList";
import ActiveWearSessions from "./ActiveWearSessions";
import CategoriesPromoCard from "./CategoriesPromoCard";
import CategoryGoalsToday from "./CategoryGoalsToday";
import InactiveCategories from "./InactiveCategories";
import IncompleteCategories from "./IncompleteCategories";
import BoxStatusCard from "@/app/components/BoxStatusCard";
import WeightReleaseCard from "./WeightReleaseCard";
import DashboardBlock from "@/app/components/DashboardBlock";
import { getOffenseRules } from "@/lib/offenseRulesService";

/**
 * **Die Blöcke des Träger-Dashboards — jeder mit seiner eigenen Datenbeschaffung.**
 *
 * Bis Etappe B lud `dashboard/page.tsx` elf Abfragen in einem `Promise.all`, bevor der erste Block
 * entstand. Ein ausgeblendeter Block sparte deshalb die Übertragung, nicht die Abfrage. Jetzt
 * deklariert jeder Block, was er braucht, und `renderStack` ruft nur die der SICHTBAREN.
 *
 * **Warum die Tabelle hier steht und nicht im Register:** das Register benennt und ordnet, es kennt
 * keine Datenbank — die Client-Komponente `DashboardStack` importiert daraus. Und die Ids sind
 * nicht global eindeutig: `boxStatus`, `sessionList`, `taskList` gibt es auf dem Träger-Dashboard
 * UND auf der Keyholder-Detailseite, mit verschiedenen Ladewegen. Ein `load` am Registereintrag
 * bräuchte deshalb einen Kontext-Union über alle vier Oberflächen; je Oberfläche eine Tabelle
 * behält den Kontext-Typ und dieselbe Compiler-Garantie.
 *
 * **Was ein Block NICHT tut: rechnen, was ein anderer auch rechnet.** Geteiltes gehört in
 * `dashboardData.ts` — auch reine Ableitungen, nicht nur Abfragen.
 */

export interface SubDashboardCtx {
  userId: string;
  username: string;
  now: Date;
  /** Derselbe Zeitpunkt als Zahl — der `cache()`-Schlüssel der geteilten Quellen. */
  nowMs: number;
  tz: string;
  dl: string;
  t: Awaited<ReturnType<typeof getTranslations<"dashboard">>>;
  tOrgasm: Awaited<ReturnType<typeof getTranslations<"orgasmForm">>>;
  tTasks: Awaited<ReturnType<typeof getTranslations<"tasks">>>;
  /**
   * Die aufgelöste Konfiguration. Gebraucht für `layout.shows(id)`: das KG-Ziel weicht der grünen
   * Session-Karte aus, muss also wissen, ob die überhaupt aufgelegt ist.
   */
  layout: ResolvedLayout<"subDashboard">;
}

/**
 * **Steht die grüne Session-Karte gerade auf dem Schirm?** EINE Antwort für die beiden Blöcke, die
 * sich darum abstimmen müssen.
 *
 * Zwei Bedingungen, und beide gehören dazu: der Block muss aufgelegt sein UND es muss eine Session
 * laufen. Dass die zweite Frage hier dieselbe Quelle liest, aus der die Karte selbst ihren Inhalt
 * zieht, ist der Punkt — die Karte hat keine eigene, hier unsichtbare Abbruchbedingung im `render`
 * (siehe `block()`), also können die beiden gar nicht verschieden antworten.
 *
 * Und weil `&&` abkürzt, kostet die Frage bei ausgeblendetem Block nichts: bleibt die Karte weg,
 * wird die Session samt Telemetrie-Nachweis nie geladen.
 */
const sessionCardOnScreen = (ctx: SubDashboardCtx): Promise<boolean> | boolean =>
  ctx.layout.shows("runningSession") && runningSessionCard(ctx).then((s) => s !== null);

/**
 * Die grüne Karte des TRÄGERS: eine laufende Session mit mindestens einem Ereignis.
 *
 * Die zweite Bedingung ist seine allein — der Keyholderin zeigt eine ereignislose Session ihren
 * Status-Balken, ihm zeigt sie nichts. Deshalb steht sie hier und nicht in der geteilten Quelle.
 */
const runningSessionCard = async (ctx: SubDashboardCtx) => {
  const running = await subRunningSessionCached(ctx.userId, ctx.nowMs, ctx.dl);
  return running && running.events.length > 0 ? running : null;
};

/**
 * Der OFFENE Zustand: seit wann, und läuft gerade eine Reinigungspause?
 *
 * Stand bis #100 in der Ladefunktion von `statusAndStats` — dort, wo der offene Held gerendert
 * wurde. Er gehört inzwischen zum Zustands-Block (`runningSession`, siehe dort), also gehört die
 * Ableitung mit; `statusAndStats` braucht davon nichts mehr.
 */
const openStateData = async ({ userId, now, tz }: SubDashboardCtx) => {
  const [latest, cleaning, activeLockPeriod, pendingLock] = await Promise.all([
    latestKgEntryCached(userId), cleaningRulesCached(userId), subLockPeriodCached(userId), pendingLockCached(userId),
  ]);
  if (!latest || latest.type === "VERSCHLUSS") return null;

    // Reinigungspause: der jüngste KG-Eintrag ist eine Reinigungsöffnung, deren Wiederverschluss
    // die Session noch fortführen würde. Ohne diese Ableitung sah der Sub in dieser Zeit
    // „Geöffnet seit …" — nicht von einer wirklich beendeten Session zu unterscheiden
    // (Rückmeldung 15.07.2026).
    //
    // Die Frist kommt aus `runningCleaningPauseUntil` — DERSELBEN Regel, nach der `buildPairs`
    // die Öffnung als blosse Unterbrechung verbucht. Das ist der Kern: der Countdown beantwortet
    // genau die Frage, die der Sub stellt („bleibt das dieselbe Session?"), und kann dem
    // Zeitstrahl darunter gar nicht widersprechen. Die Strafbuch-Frist
    // (`cleaningRelockObligation`) ist eine ANDERE Frist — siehe die Warnung an beiden Funktionen.
    //
    // BEWUSST nur Anzeige: `isLocked`, die Box-Kopplung und jede Statistik bleiben unberührt —
    // die Box IST offen, und ein erzwungenes „verschlossen" bräche das Wiederverschluss-Formular
    // und die Entry-Guards.
    const cleaningPauseUntil = runningCleaningPauseUntil(latest, cleaning.rules, now);

    // Die STRAFFRIST daneben, und zwar nur, wenn sie FRÜHER liegt als der Countdown oben.
    //
    // Der Countdown beantwortet „bleibt das dieselbe Session?" und darf das auch weiter
    // (Begründung oben). Aber die Frist, gegen die BESTRAFT wird, ist eine andere: bei
    // konfiguriertem Reinigungsfenster reicht sie bis ans Fensterende, und der Kommentar an
    // `cleaningInterruptionDeadline` nimmt an, das sei immer SPÄTER. Es kann früher sein —
    // Öffnung 21:55, Fenster bis 22:00, Kontingent 15 Minuten: der Countdown lief bis 22:10, das
    // Vergehen entstand um 22:00. Wer bei grünem Countdown um 22:05 verschloss, hatte ein
    // Vergehen und keine Ahnung warum. Die strengere Frist gehört ihm gesagt, nicht die bequemere.
    //
    // Die Sperrzeit, die zur ÖFFNUNGSZEIT schon galt — nicht die, die jetzt gilt. Das Strafbuch
    // nimmt ebenfalls die damalige (`findActiveLockPeriod` prüft `openTime >= s.createdAt`). Eine
    // erst nach der Öffnung angelegte Sperrzeit ergäbe hier eine Drohung, der im Strafbuch nichts
    // entspricht.
    const lockPeriodAtOpening = latest && activeLockPeriod && activeLockPeriod.createdAt <= latest.startTime
      ? activeLockPeriod
      : null;
    const cleaningRelockDeadline = latest && cleaningPauseUntil
      // Die Fassung, die zur ÖFFNUNG galt — dieselbe, nach der `buildPairs` und das Strafbuch
      // diese Pause beurteilen, und ALLE Felder aus ihr: käme das Fenster aus der heutigen
      // Spalte, liefen Countdown und Vergehens-Frist für dieselbe Pause auseinander.
      ? await (async () => {
          const settings = cleaning.at(latest.startTime);
          return cleaningRelockObligation(
            latest,
            lockPeriodAtOpening,
            cleaningPermissionUserAt(settings, tz),
            settings.maxMinutes,
            await cleaningWindowEnforcedFrom(now),
          );
        })()
      : null;
    const cleaningRelockWarnUntil =
      cleaningRelockDeadline && cleaningPauseUntil && cleaningRelockDeadline < cleaningPauseUntil
        ? cleaningRelockDeadline
        : null;

  // Der wartende Aufruf, gemessen ab seiner ERFASSUNG (`createdAt`) — nicht ab `startTime`: die
  // wird beim Vollzug ohnehin überschrieben, und bis dahin steht dort ein Wert, den niemand gewählt
  // hat (das Formular zeigt für einen Riegel-Träger gar kein Zeitfeld mehr).
  const lockCall = pendingLock ? { id: pendingLock.id, at: pendingLock.createdAt } : null;

  return { since: latest.startTime, cleaningPauseUntil, cleaningRelockWarnUntil, lockCall };
};

/**
 * „Reinigungsöffnungen erlaubt" — und wann. Der Bereich steht nur dabei, wenn Fenster gesetzt sind
 * und eines noch kommt oder gerade läuft; benannt wird er von {@link datedWindowLabel}, derselben
 * Beschriftung wie im Öffnen-Formular.
 *
 * Als eigene Funktion und nicht inline im Block: die Zeile hat drei Ausgänge, und im JSX-Ausdruck
 * daneben stünden sie als geschachtelte Ternäre neben zwei weiteren Bedingungen.
 */
function cleaningAllowedNote(windows: unknown, now: Date, tz: string, dl: string, t: Translate): string {
  const cleaningWindow = currentOrNextCleaningWindow(windows, now, tz);
  if (!cleaningWindow) return t("cleaningNoteAllowed");
  return t("cleaningNoteAllowedWindow", {
    window: datedWindowLabel(cleaningWindow, buildWeekdayLabels(dl), t("windowInAWeek")),
  });
}

/** Kürzel für die geteilte Herleitung — die KG-Beschriftung steckt in jeder Aufgaben-Auswertung. */
const taskCardsOf = (ctx: SubDashboardCtx) =>
  taskCardsCached(ctx.userId, ctx.nowMs, ctx.tTasks("requirementKgLocked"), "sub");

export const SUB_DASHBOARD_BLOCK_TABLE: Record<SubDashboardBlockId, StackBlock<SubDashboardCtx>> = {
  // Anforderungen mit Frist vor allem anderen — auch vor der Box-Karte.
  alerts: block({
    load: async ({ userId, nowMs }) => {
      const [anforderungen, offeneVerschlussAnf, offeneOrgasmusAnf, user, orgasmCfg] = await Promise.all([
        subVisibleInspectionsNow(userId), lockRequestCached(userId, nowMs),
        subOrgasmRequestCached(userId, nowMs), userRowCached(userId), orgasmConfigCached(userId),
      ]);
      return { anforderungen, offeneVerschlussAnf, offeneOrgasmusAnf, user, orgasmCfg };
    },
    render: ({ anforderungen, offeneVerschlussAnf, offeneOrgasmusAnf, user, orgasmCfg }, { now, tz, dl, t, tOrgasm }) => {
      // ALLE offenen — je Ziel kann eine laufen (v5.0.1). Dringendste zuerst, damit das Banner mit
      // der knappsten Frist oben steht.
      const pendingInspections = openInspections(anforderungen);

      const orgasmusVorgabeLabel = offeneOrgasmusAnf?.requiredType
        ? resolveReasonLabel(offeneOrgasmusAnf.requiredType, orgasmCfg, "orgasm", tOrgasm)
        : null;

      const alertProps: DashboardAlertsProps = {
        tz,

        pendingInspections: pendingInspections.map((k) => ({
          deadline: k.deadline.toISOString(),
          code: k.code,
          target: inspectionTargetLabel(k),
          overdue: k.deadline < now,
          href: inspectionHref(k.code, { kommentar: k.kommentar, categoryId: k.categoryId }),
          // WANN das System selbst eingreift — die Zahl, die der Sub bisher nirgends sehen konnte.
          // Die Rechnung liegt neben der DURCHSETZUNG (`predictAutoMarkAt`), nicht hier: sie kennt
          // den Mahn-Stempel als Anker und den Schlaf-Fenster-Sonderfall, und beides von Hand
          // nachzubauen hiesse, die Zwei-Stufen-Logik ein zweites Mal zu führen.
          autoMarkAt: user ? predictAutoMarkAt(k, { ...user, timezone: tz })?.toISOString() ?? null : null,
        })),

        offeneVerschlussAnf: offeneVerschlussAnf ? {
          message: joinParts(
            offeneVerschlussAnf.device ? t("lockDevicePrefix", { name: offeneVerschlussAnf.device.name }) : null,
            offeneVerschlussAnf.message,
          ),
          deadlineLabel: offeneVerschlussAnf.endsAt ? t("lockUntil", { date: formatDateTime(offeneVerschlussAnf.endsAt, dl, tz) }) : null,
          // Verstrichen heisst: es läuft bereits ein Vergehen (`late_lock`). Das Banner sah bisher
          // aus wie am ersten Tag — der einzige Unterschied war ein Datum, das er selbst mit der
          // Uhr vergleichen musste.
          overdue: !!offeneVerschlussAnf.endsAt && offeneVerschlussAnf.endsAt < now,
          // Ohne Geräte-Parameter: das Formular liest die offene Anforderung selbst und belegt ihr
          // Gerät vor (`anforderungDeviceId`). Ein zweiter Weg dorthin wäre eine zweite Wahrheit.
          href: "/dashboard/new/verschluss",
        } : null,

        offeneOrgasmusAnf: offeneOrgasmusAnf ? {
          label: offeneOrgasmusAnf.art === "ANWEISUNG" ? t("orgasmInstructed") : t("orgasmOpportunity"),
          message: joinParts(
            orgasmusVorgabeLabel ? t("orgasmRequiredArt", { art: orgasmusVorgabeLabel }) : null,
            offeneOrgasmusAnf.message,
          ),
          windowLabel: t("orgasmWindowFromUntil", { from: formatDateTime(offeneOrgasmusAnf.beginsAt, dl, tz), until: formatDateTime(offeneOrgasmusAnf.endsAt, dl, tz) }),
        } : null,
      };

      return <DashboardAlerts {...alertProps} />;
    },
  }),

  boxStatus: block({
    // Ohne Heimdall gibt es keine Box-Karte — dann auch keine Abfragen für sie.
    load: async ({ userId }) => {
      if (!heimdallEnabled()) return null;
      // Der Zustand des TRÄGERS gehört dazu: nur mit ihm kann die Karte „Riegel zu, obwohl
      // niemand verschlossen ist" von „Riegel zu, während der Verschluss läuft" unterscheiden.
      // Das ist EINE zusätzliche indizierte Abfrage (`getLatestKgEntry`), nicht gratis — aber die
      // Alternative wäre, den Zustand aus den Einträgen nachzurechnen und damit eine zweite Fassung
      // derselben Regel zu führen.
      const [wearerLocked, keyInBox] = await Promise.all([
        getIsLocked(userId),
        // Ohne diesen Wert läse die Karte den Reisefall als Versäumnis — Begründung an
        // `latestKeyInBoxCached` und `boxBoltOpenDespiteLocked`.
        latestKeyInBoxCached(userId),
      ]);
      return { wearerLocked, keyInBox };
    },
    // `null` heisst „ohne Box" — die Karte hängt an Heimdall, und ohne den lief der Loader gar nicht
    // erst.
    render: (data) => heimdallEnabled() && data !== null && (
      <BoxStatusCard wearerLocked={data.wearerLocked} keyInBox={data.keyInBox} />
    ),
  }),

  openTasks: block({
    load: async (ctx) => (await taskCardsOf(ctx)).open,
    render: (tasks, { tz, collapseDefault }) => <OpenTasks tasks={tasks} tz={tz} defaultCollapsed={collapseDefault} />,
  }),

  // UNTER den Aufgaben: eine Aufgabe mit Frist tickt, eine offene Strafe ist ein Zustand.
  // Der Block lädt seine Strafen selbst — sonst müsste diese Seite dieselbe Auflösung noch einmal
  // aufrufen, nur um sie durchzureichen. Deshalb in `Suspense`: sein Laden hängt sonst als weitere
  // serielle Phase am Seiten-Rendering, und die ganze Seite wartete auf einen Block, den die
  // meisten Nutzer nie zu sehen bekommen. `dashboardTaskIds` = die Aufgaben, die oben tatsächlich
  // stehen — daran entscheidet der Block, ob eine Strafaufgabe hier zu wiederholen wäre.
  openPenalties: block({
    load: async ({ userId, nowMs, tTasks }) => {
      const evaluated = await evaluatedTasksCached(userId, nowMs, tTasks("requirementKgLocked"), "sub");
      // Nur die Ids — die Karten dazu baut der Aufgaben-Block, dieser hier fragt bloss ab, welche
      // Aufgabe oben schon steht.
      return new Set(
        evaluated.filter((e) => belongsOnDashboard(e, new Date(nowMs))).map((e) => e.task.id),
      );
    },
    render: (dashboardTaskIds, { userId, tz, now, collapseDefault }) => (
      <Suspense fallback={null}>
        <OpenPenalties userId={userId} tz={tz} now={now} dashboardTaskIds={dashboardTaskIds} defaultCollapsed={collapseDefault} />
      </Suspense>
    ),
  }),

  // Die Freigabe-Vorgabe: welches Gewicht den nächsten Orgasmus öffnet. NACH den offenen Strafen
  // und vor der laufenden Session — sie ist kein Alarm mit Frist, aber eine Bedingung, gegen die er
  // täglich rechnet (docs/gewicht-freigabe-konzept.md, Abschnitt 10).
  weightRelease: block({
    load: async ({ userId, now, dl, tz }) => {
      const status = await weightReleaseStatus(userId, now);
      if (!status) return null;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { unitSystem: true } });
      return {
        thresholdKg: status.thresholdKg,
        nextThresholdKg: status.nextThresholdKg,
        averageKg: status.averageKg,
        averageDays: status.release.averageDays,
        direction: status.release.direction,
        remainingKg: status.remainingKg,
        reason: status.reason,
        // Auf dem Server formatiert: Locale und Zeitzone sind hier bekannt, und eine
        // Client-Komponente, die selbst formatiert, weicht bis zur Hydration ab.
        notBeforeLabel: formatDateTime(status.release.notBeforeAt, dl, tz),
        unitSystem: ((user?.unitSystem ?? "metric") as UnitSystem),
        locale: dl,
      };
    },
    render: (props, { collapseDefault }) => props && <WeightReleaseCard {...props} defaultCollapsed={collapseDefault} />,
  }),

  /**
   * **Der Zustands-Block.** Er beantwortet die Leitfrage des Bildschirms — „in welchem Zustand bin
   * ich, seit wann" — und zwar in BEIDEN Zuständen: verschlossen die laufende Session, sonst der
   * offene Held.
   *
   * Bis #100 tat das nur die verschlossene Hälfte. Der offene Held steckte in `statusAndStats` an
   * Position 11, während dieser Block an Position 6 steht: wer öffnete, sah dieselbe Auskunft von
   * oben nach unten springen.
   *
   * **Die Kennung bleibt `runningSession`, obwohl der Name jetzt zu eng ist.** Eine neue Kennung
   * liefe durch `mergeOrder` und würde bei jedem Nutzer mit gespeicherter Anordnung neu einsortiert
   * — ein Block, den er nie verschoben hat, wanderte dabei. Der Preis ist ein Name, der die Hälfte
   * seiner Aufgabe verschweigt; die Beschriftung in der Anpassen-Liste sagt es dafür richtig.
   */
  runningSession: block({
    load: async (ctx) => {
      const { userId, nowMs, now, tz } = ctx;
      const running = await runningSessionCard(ctx);
      // Keine laufende Session heisst nicht „nichts anzeigen", sondern „den anderen Zustand
      // anzeigen". Das war der Fehler: `null` hier liess den Platz leer und der offene Held suchte
      // sich einen eigenen weiter unten.
      //
      // `null`, wenn es AUCH keinen offenen Zustand gibt (Konto ohne KG-Eintrag): `blockStack`
      // schreibt vor, dass die Ladefunktion das entscheidet und nicht das Rendern. Eine zweite
      // Abbruchbedingung dort wäre für jeden ausserhalb unsichtbar — `sessionCardOnScreen` und
      // jeder künftige Block, der sich auf diesen bezieht, bekäme „ist sichtbar" für einen leeren
      // Platz gemeldet.
      if (!running) {
        const open = await openStateData(ctx);
        return open && ({ open } as const);
      }
      const [activeLockPeriod, user, activeVorgabe, hours, deviceCount, offenseRules] = await Promise.all([
        subLockPeriodCached(userId), userRowCached(userId), activeVorgabeCached(userId, nowMs),
        wearingHoursCached(userId, nowMs, tz), deviceCountCached(userId),
        // Für die Folge-Zeile unter der Sperrzeit: OB ein früheres Öffnen geahndet wird, ist je Sub
        // schaltbar. Ohne diese Abfrage behauptete die Karte eine Regel, die abgeschaltet sein kann.
        getOffenseRules(userId, now),
      ]);
      // `open: null` als Unterscheidungsmerkmal — mit `"open" in data` müsste jede Verwendung
      // darunter noch einmal auf `undefined` prüfen, obwohl der Zweig sie ausschliesst.
      return { open: null, ...running, activeLockPeriod, user, activeVorgabe, hours, deviceCount, offenseRules };
    },
    render: (data, { now, tz, dl, t }) => data && (
      data.open ? (
        <DashboardBlock>
          <OpenStateHero
            since={data.open.since.toISOString()}
            cleaningPauseUntil={data.open.cleaningPauseUntil?.toISOString() ?? null}
            /* FERTIG formatiert und in der Zone des SUBS: die Frist ist ein Fensterende in seiner
               Wanduhrzeit. Im Client formatiert stünde dort die Gerätezone des Betrachters — und
               beim Server-Rendering die des Containers, was zusätzlich einen Hydration-Unterschied
               ergäbe. */
            cleaningRelockWarnTime={data.open.cleaningRelockWarnUntil ? formatTime(data.open.cleaningRelockWarnUntil, dl, tz) : null}
            cleaningRelockWarnPassed={!!data.open.cleaningRelockWarnUntil && data.open.cleaningRelockWarnUntil < now}
            lockCall={data.open.lockCall && { id: data.open.lockCall.id, at: data.open.lockCall.at.toISOString() }}
          />
        </DashboardBlock>
      ) : (
      <DashboardBlock>
        <LaufendeSessionCard
          sessionStart={data.activePair.verschluss.startTime}
          interruptionPausedMs={interruptionPauseMs(data.activePair.interruptions)}
          now={now}
          events={data.events}
          lockPeriodEndsAt={data.activeLockPeriod?.endsAt ?? null}
          lockPeriodIndefinite={!!data.activeLockPeriod && data.activeLockPeriod.endsAt === null}
          lockPeriodMessage={data.activeLockPeriod?.message ?? null}
          // Sub-Sicht: nur wenn er grundsätzlich reinigen darf. Sonst verspräche die Zeile etwas,
          // das seine Benutzer-Einstellung ohnehin verbietet.
          //
          // MIT DEM FENSTER, sofern eines gesetzt ist (Rückmeldung 03.09.2026): „Reinigungsöffnungen
          // erlaubt" allein sagt DASS, aber nicht WANN — und während einer Sperrzeit ist genau das
          // die Auskunft, auf die es ankommt. Sie stand bis zum v6-Umbau auf der Box-Karte und fiel
          // dort in drei Schritten heraus; hier gehört sie ohnehin besser hin: die Zeile erscheint
          // nur bei laufender Sperrzeit, also genau dann, wenn die Fenster überhaupt binden.
          //
          // Das LAUFENDE Fenster schlägt das nächste (`currentOrNextCleaningWindow`) — wer gerade
          // reinigen darf, will nicht den Termin von morgen lesen. Ohne konfigurierte Fenster bleibt
          // es beim blossen „erlaubt": dann ist die Reinigung nicht zeitgebunden, und ein Bereich
          // behauptete eine Schranke, die es nicht gibt.
          cleaningNote={
            data.activeLockPeriod && data.user?.cleaningAllowed
              ? (data.activeLockPeriod.cleaningAllowed
                  ? cleaningAllowedNote(data.user.cleaningWindows, now, tz, dl, t)
                  : t("cleaningNoteForbidden"))
              : null
          }
          // Nur wenn die Regel wirklich gilt — sie ist je Sub abschaltbar. Und wenn eine
          // Reinigungsöffnung erlaubt ist, nennt der Text die Ausnahme: sonst stünde die Behauptung
          // eine Zeile unter dem Hinweis, dass Reinigen erlaubt ist, und widerspräche ihm.
          lockBreakNote={
            data.offenseRules.unauthorized_opening === "off"
              ? null
              : t(data.activeLockPeriod?.cleaningAllowed && data.user?.cleaningAllowed
                  ? "sessionLockedConsequenceCleaning"
                  : "sessionLockedConsequence")
          }
          keyInBox={data.activePair.verschluss.keyInBox ?? null}
          activeVorgabe={data.activeVorgabe ? resolveGoalTargets(data.activeVorgabe, now, tz) : null}
          tagH={data.hours.tagH}
          wocheH={data.hours.wocheH}
          monatH={data.hours.monatH}
          jahrH={data.hours.jahrH}
          tz={tz}
          userHasDevices={data.deviceCount > 0}
        />
      </DashboardBlock>
      )
    ),
  }),

  activeWearSessions: block({
    load: async ({ userId, nowMs, now, tTasks }) => {
      const [sessions, evaluated] = await Promise.all([
        activeWearSessionsCached(userId),
        evaluatedTasksCached(userId, nowMs, tTasks("requirementKgLocked"), "sub"),
      ]);
      // Die Trage-Karte ist vollflächig ein Link aufs Ablege-Formular — ohne Markierung sähe eine
      // gebundene Session aus wie jede andere. Gefragt wird je Session (Kategorie UND Gerät) über
      // `isHeldByTask`, also mit demselben Prädikat wie die Warnung im Formular: eine Bedingung auf
      // ein bestimmtes Gerät darf nicht die ganze Kategorie markieren, vor der danach niemand warnt.
      return sessions.map((s) => ({
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        categoryColor: s.categoryColor,
        categoryIcon: s.categoryIcon,
        deviceName: s.deviceName,
        since: s.since.toISOString(),
        heldReason: isHeldByTask(evaluated, { categoryId: s.categoryId, deviceId: s.deviceId }, now)
          ? tTasks("heldByTask")
          : null,
        imageUrl: s.imageUrl,
      }));
    },
    render: (sessions, { now }) => <ActiveWearSessions sessions={sessions} serverNow={now.toISOString()} />,
  }),

  // Der Schalter wird hier gebraucht und nicht nur in der Quelle: eine leere Kategorie-Liste heisst
  // „noch keine angelegt" — genau der Fall, für den diese Karte wirbt. Ohne die Funktion gäbe es
  // dagegen nichts anzulegen.
  categoriesPromo: block({
    load: async ({ userId }) =>
      deviceCategoriesEnabled() ? (await trackingCategoriesCached(userId)).length === 0 : null,
    render: (empty) => empty !== null && <CategoriesPromoCard show={empty} />,
  }),

  // Ohne Gerät ist die Kategorie ein halber Schritt, kein Zustand — sichtbar hier statt unten
  // im eingeklappten „Nicht getragen" (Issue #49). Ohne Feature-Flag ist die Liste leer, der
  // Block blendet sich selbst aus.
  incompleteCategories: block({
    load: async ({ userId }) => {
      const [categories, withActiveSession] = await Promise.all([
        trackingCategoriesCached(userId), activeWearCategoryIdsCached(userId),
      ]);
      return categories.filter((c) => categoryNeedsDevice({ ...c, hasActiveSession: withActiveSession.has(c.id) }));
    },
    render: (categories) => <IncompleteCategories categories={categories} />,
  }),

  categoryGoals: block({
    load: async (ctx) => {
      const { userId, nowMs, now, tz } = ctx;
      const [wearSessions, entries, activeVorgabe, hours, sessionCard] = await Promise.all([
        activeWearSessionsCached(userId), entriesCached(userId), activeVorgabeCached(userId, nowMs),
        wearingHoursCached(userId, nowMs, tz), sessionCardOnScreen(ctx),
      ]);
      // Das KG-Ziel steht während einer Sperre in der grünen Session-Karte (LaufendeSessionCard).
      // Steht die nicht — weil keine Sperre läuft ODER weil der Träger den Block ausgeblendet hat —
      // hätte es sonst nirgends Platz; dann zeigen wir es als führende Zeile in der
      // „Trainingsvorgaben"-Karte (derselben, die die Kategorie-Ziele trägt). Dieselbe Herleitung
      // nimmt die Admin-Übersicht — so zeigen beide Sichten dieselbe Zeile.
      const kgGoal = buildKgGoalRow(activeVorgabe, hours, now, tz, !!sessionCard);
      return { wearSessions, entries, kgGoal };
    },
    render: ({ wearSessions, entries, kgGoal }, { userId, tz, collapseDefault }) => (
      <CategoryGoalsToday
        userId={userId}
        tz={tz}
        defaultCollapsed={collapseDefault}
        activeWearSessions={wearSessions}
        entries={entries}
        includeCategories={deviceCategoriesEnabled()}
        kgGoal={kgGoal}
      />
    ),
  }),

  inactiveCategories: block({
    load: async ({ userId, nowMs, now, tz }) => {
      const [categories, withActiveSession, sessionList] = await Promise.all([
        trackingCategoriesCached(userId), activeWearCategoryIdsCached(userId), wearSessionsCached(userId, nowMs),
      ]);
      // Bespielbar ist eine Kategorie erst mit Gerät — ohne eines lässt sich darin nichts erfassen.
      const wearPairsByCategory = wearHourPairsByCategory(sessionList, now);
      return categories
        .filter((c) => c.deviceCount > 0 && !withActiveSession.has(c.id))
        .map((c) => ({
          ...c,
          todayHours: wearingHoursFromPairs(wearPairsByCategory.get(c.id) ?? [], getMidnightToday(now, tz), now),
        }));
    },
    render: (categories) => <InactiveCategories categories={categories} />,
  }),

  statusAndStats: block({
    load: async ({ userId, nowMs, tz }) => {
      const [entries, latest, hours] = await Promise.all([
        entriesCached(userId), latestKgEntryCached(userId), wearingHoursCached(userId, nowMs, tz),
      ]);

      return { hasEntries: entries.length > 0, latest, hours };
    },
    render: (data, { now, tz }) => {
      const clientProps: DashboardProps = {
        currentStatus: data.latest
          ? { type: data.latest.type as "VERSCHLUSS" | "OEFFNEN", since: data.latest.startTime.toISOString() }
          : null,
        hasEntries: data.hasEntries,

        tagH: data.hours.tagH,
        wocheH: data.hours.wocheH,
        monatH: data.hours.monatH,
        serverNow: now.toISOString(),
        elapsedTagH: (now.getTime() - getMidnightToday(now, tz).getTime()) / 3_600_000,
        elapsedWocheH: (now.getTime() - getWeekStart(now, tz).getTime()) / 3_600_000,
        elapsedMonatH: (now.getTime() - getMonthStart(now, tz).getTime()) / 3_600_000,
      };
      return <DashboardClient {...clientProps} />;
    },
  }),

  sessionList: block({
    load: ({ userId, nowMs }) => sessionListDataCached(userId, nowMs, "sub"),
    render: (data, { tz, collapseDefault }) => data.pairs.length > 0 ? (
      <DashboardBlock>
        <SessionList
          defaultCollapsed={collapseDefault}
          pairs={data.pairs}
          orgasmusEntries={data.orgasmusEntries}
          userHasDevices={data.deviceCount > 0}
          tz={tz}
          orgasmusArtenConfig={data.user?.orgasmusArtenConfig}
          oeffnenGruendeConfig={data.user?.oeffnenGruendeConfig}
          telemetryKeyProof={data.telemetryKeyProof}
        />
      </DashboardBlock>
    ) : null,
  }),

  wearSessionList: block({
    load: ({ userId, nowMs, dl }) => wearSessionRowsCached(userId, nowMs, dl),
    render: (rows, { collapseDefault }) => rows.length > 0 ? (
      <DashboardBlock>
        <WearSessionList sessions={rows} defaultCollapsed={collapseDefault} />
      </DashboardBlock>
    ) : null,
  }),

  // Der ganze Bestand — hier unten bei den übrigen Historien-Listen, nicht oben bei dem, was
  // gerade zu tun ist.
  taskList: block({
    load: async (ctx) => (await taskCardsOf(ctx)).all,
    render: (tasks, { tz, collapseDefault }) => tasks.length > 0 ? (
      <DashboardBlock>
        <TaskList tasks={tasks} tz={tz} defaultCollapsed={collapseDefault} />
      </DashboardBlock>
    ) : null,
  }),
};
