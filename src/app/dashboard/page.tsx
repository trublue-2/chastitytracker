import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime, formatHours,
  buildPairs, getOpenPair, interruptionPauseMs, buildKontrolleItems, runningCleaningPauseUntil,
  toDateLocale, calculateWearingHoursByRange,
  getMidnightToday, getWeekStart, getMonthStart,
  wearingHoursFromPairs, joinParts, APP_TZ,
  type ReinigungSettings,
} from "@/lib/utils";
import { buildWearSessions, wearHourPairsByCategory } from "@/lib/sessionModel";
import { buildWearSessionRows } from "@/lib/wearSessionRows";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions, getNonKgTrackingCategories, getActiveOrgasmusAnforderung, aktiveKontrolleWhere, getOpenLockRequest, KONTROLLE_TARGET_INCLUDE } from "@/lib/queries";
import { deviceCategoriesEnabled, heimdallEnabled } from "@/lib/constants";
import { buildBoxReinigungView } from "@/lib/boxReinigung";
import { loadTelemetryKeyProof } from "@/lib/boxKeyProof";
import { effectiveOrgasmusArten, resolveReasonLabel, resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { getTranslations, getLocale } from "next-intl/server";
import DashboardClient, { type DashboardProps } from "./DashboardClient";
import DashboardAlerts, { type DashboardAlertsProps } from "./DashboardAlerts";
import OpenTasks from "./OpenTasks";
import OpenPenalties from "./OpenPenalties";
import TaskList from "./TaskList";
import { getEvaluatedTaskHistory, isHeldByTask, belongsOnDashboard, loadTaskProofViews } from "@/lib/taskIntervals";
import { toTaskCard } from "@/lib/taskView";
import LaufendeSessionCard from "./LaufendeSessionCard";
import SessionList from "./SessionList";
import WearSessionList from "./WearSessionList";
import ActiveWearSessions from "./ActiveWearSessions";
import CategoriesPromoCard from "./CategoriesPromoCard";
import CategoryGoalsToday from "./CategoryGoalsToday";
import InactiveCategories from "./InactiveCategories";
import IncompleteCategories from "./IncompleteCategories";
import BoxStatusCard from "@/app/components/BoxStatusCard";
import DashboardBlock from "@/app/components/DashboardBlock";
import { categoryNeedsDevice } from "@/lib/categoryConstants";
import { inspectionHref } from "@/lib/entryFormRoute";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const t = await getTranslations("dashboard");
  const tOrgasm = await getTranslations("orgasmForm");
  const tTasks = await getTranslations("tasks");
  const dl = toDateLocale(await getLocale());
  const tz = session.user.timezone ?? APP_TZ;
  const now = new Date();

  // ── Parallel data fetch ──
  const flagOn = deviceCategoriesEnabled();
  const [entries, alleAnforderungen, activeVorgabe, offeneVerschlussAnf, activeSperrzeit, userSettings, wearSessions, allNonKgCategories, deviceCount, offeneOrgasmusAnf] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      include: { device: { select: { id: true, categoryId: true, name: true } } },
    }),
    // Zeitversetzt geplante Kontrollen (wirksamAb in der Zukunft) bleiben für den Sub unsichtbar.
    prisma.kontrollAnforderung.findMany({
      where: { userId, ...aktiveKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
      // Ziel-Namen fürs Banner: der Sub muss wissen, WAS er zeigen soll.
      include: { entry: true, ...KONTROLLE_TARGET_INCLUDE },
    }),
    getActiveVorgabe(userId, now),
    // Zeitversetzt geplante Anforderungen (wirksamAb in der Zukunft) bleiben für den Sub unsichtbar.
    // Bei mehreren offenen zeigt das Banner die dringendste — ein Verschluss erfüllt ohnehin alle.
    getOpenLockRequest(userId, now),
    getActiveSperrzeit(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true, orgasmusArtenConfig: true, oeffnenGruendeConfig: true } }),
    flagOn ? getActiveWearSessions(userId) : Promise.resolve([]),
    flagOn ? getNonKgTrackingCategories(userId) : Promise.resolve([]),
    prisma.device.count({ where: { userId, archivedAt: null } }),
    getActiveOrgasmusAnforderung(userId, now),
  ]);
  const userHasDevices = deviceCount > 0;

  const reinigung: ReinigungSettings = {
    erlaubt: userSettings?.reinigungErlaubt ?? false,
    maxMinuten: userSettings?.reinigungMaxMinuten ?? 15,
  };

  // ── Compute derived state ──
  // ALLE offenen — je Ziel kann eine laufen (v5.0.1). Dringendste zuerst, damit das Banner mit der
  // knappsten Frist oben steht.
  const offeneKontrollen = alleAnforderungen
    .filter((k) => !k.entryId && !k.withdrawnAt)
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

  const latest = [...entries]
    .filter((e) => ["VERSCHLUSS", "OEFFNEN"].includes(e.type))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;

  const currentStatus = latest
    ? { type: latest.type as "VERSCHLUSS" | "OEFFNEN", since: latest.startTime.toISOString() }
    : null;

  // Reinigungspause: der jüngste KG-Eintrag ist eine Reinigungsöffnung, deren Wiederverschluss die
  // Session noch fortführen würde. Ohne diese Ableitung sah der Sub in dieser Zeit „Geöffnet
  // seit …" — nicht von einer wirklich beendeten Session zu unterscheiden (Rückmeldung 15.07.2026).
  //
  // Die Frist kommt aus `runningCleaningPauseUntil` — DERSELBEN Regel, nach der `buildPairs` die
  // Öffnung als blosse Unterbrechung verbucht. Das ist der Kern: der Countdown beantwortet genau
  // die Frage, die der Sub stellt („bleibt das dieselbe Session?"), und kann dem Zeitstrahl
  // darunter gar nicht widersprechen. Die Strafbuch-Frist (`cleaningRelockObligation`) ist eine
  // ANDERE Frist — siehe die Warnung an beiden Funktionen.
  //
  // BEWUSST nur Anzeige: `isLocked`, die Box-Kopplung und jede Statistik bleiben unberührt — die
  // Box IST offen, und ein erzwungenes „verschlossen" bräche das Wiederverschluss-Formular und die
  // Entry-Guards.
  const cleaningPauseUntil = runningCleaningPauseUntil(latest, reinigung, now);

  // ── Build kontroll items for session events ──
  const kontrollItems = buildKontrolleItems(alleAnforderungen, entries.filter(e => e.type === "PRUEFUNG"), now);
  const pairs = buildPairs(entries, kontrollItems, reinigung);
  const activePair = getOpenPair(pairs);

  const orgasmusEntries = entries
    .filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // ── Box-Ableitungen ──
  // Die Reinigungs-Regeln der Box-Karte (Begründung in `buildBoxReinigungView`) zählen ihr
  // Tageskontingent aus den oben geladenen `entries` — ohne DB. Nur der Schlüssel-Nachweis aus der
  // Telemetrie (`boxKeyProof.ts`) fragt noch ab, deshalb hier kein `Promise.all` mehr.
  const boxReinigung = buildBoxReinigungView(userSettings, entries, activeSperrzeit, now, tz);
  const telemetryKeyProof = await loadTelemetryKeyProof(userId, pairs);

  const orgasmCfg = effectiveOrgasmusArten(userSettings?.orgasmusArtenConfig);
  const rawSessionEvents = activePair
    ? buildSessionEvents(activePair, orgasmusEntries, dl, (art) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm), telemetryKeyProof)
    : [];

  const { tagH, wocheH, monatH, jahrH } = calculateWearingHoursByRange(entries, now, tz);

  // Aufgaben: Zustand wird abgeleitet, deshalb erst laden, dann auswerten. `evaluateTasks` lädt ohne
  // Aufgaben gar nichts nach — Nutzer ohne Aufgaben zahlen keinen Preis dafür.
  // `entries` und die Reinigungs-Regeln stehen hier längst — durchreichen, statt dieselben Zeilen ein
  // zweites Mal zu laden und ein zweites Mal zu paaren.
  // EINMAL alles laden: der Aufgaben-Block zeigt daraus, was jetzt zu tun ist, die Liste darunter
  // den ganzen Bestand. Zwei Abfragen wären dieselben Zeilen zweimal.
  const evaluatedTasks = await getEvaluatedTaskHistory(userId, now, {
    kgLabel: tTasks("requirementKgLocked"), kgEntries: entries, wearEntries: entries, reinigung,
  });
  // Die Anzeige-Felder der Nachweise (Beschreibung, Code) hängen nicht am Auswertungs-Include —
  // eine Abfrage über die sichtbaren Aufgaben, nicht eine je Karte.
  const proofViews = await loadTaskProofViews(evaluatedTasks.map((e) => e.task.id));
  const card = (e: (typeof evaluatedTasks)[number], withLinks: boolean) =>
    toTaskCard(e, withLinks, proofViews.get(e.task.id) ?? []);
  // Oben nach nächster Frist zuerst (die Liste kommt absteigend, also umdrehen) — was am dringendsten
  // ist, steht zuoberst.
  const taskCards = evaluatedTasks.filter((e) => belongsOnDashboard(e, now)).reverse().map((e) => card(e, true));
  // Die Liste ist die ARCHIV-Sicht: keine Deep-Links, denn die Formulare stehen an den Karten oben.
  const taskListCards = evaluatedTasks.map((e) => card(e, false));

  // Die Trage-Karte ist vollflächig ein Link aufs Ablege-Formular — ohne Markierung sähe eine
  // gebundene Session aus wie jede andere. Gefragt wird je Session (Kategorie UND Gerät) über
  // `isHeldByTask`, also mit demselben Prädikat wie die Warnung im Formular: eine Bedingung auf ein
  // bestimmtes Gerät darf nicht die ganze Kategorie markieren, vor der danach niemand warnt.
  const isSessionHeldByTask = (categoryId: string, deviceId: string) =>
    isHeldByTask(evaluatedTasks, { categoryId, deviceId }, now);

  // Das KG-Ziel steht während einer Sperre in der grünen Session-Karte (LaufendeSessionCard). Läuft
  // KEINE Sperre, hätte es sonst nirgends Platz — dann zeigen wir es als führende Zeile in der
  // „Trainingsvorgaben"-Karte (dieselbe, die die Kategorie-Ziele trägt), damit der Sub sein KG-Ziel
  // auch im offenen Zustand sieht statt nur beim Verschluss.
  const kgTargets = activeVorgabe ? proratedVorgabeTargets(activeVorgabe, now, tz) : null;
  const showLaufendeSession = !!activePair && rawSessionEvents.length > 0;
  const inlineKgGoal =
    !showLaufendeSession && kgTargets &&
    (kgTargets.minProTagH != null || kgTargets.minProWocheH != null || kgTargets.minProMonatH != null || kgTargets.minProJahrH != null)
      ? {
          tagH, wocheH, monatH, jahrH,
          goalDayH: kgTargets.minProTagH, goalWeekH: kgTargets.minProWocheH,
          goalMonthH: kgTargets.minProMonatH, goalYearH: kgTargets.minProJahrH,
        }
      : null;

  // Die Trage-Sessions EINMAL bauen — Zeilen-Liste und Wanduhr-Stunden je Kategorie leiten sich
  // beide daraus ab (je GERÄT gepaart, Überlappungen für die Stunden verschmolzen).
  const wearSessionList = buildWearSessions(entries, now);
  const wearSessionRows = buildWearSessionRows(allNonKgCategories, wearSessionList, dl, entries);

  // Bespielbar ist eine Kategorie erst mit Gerät — ohne eines lässt sich darin nichts erfassen. Die
  // Trennung gilt nur für die ANZEIGE der Kategorie-Blöcke; die Session-Liste oben bekommt weiter
  // alle, sonst verschwänden vergangene Sessions einer Kategorie, deren Gerät archiviert wurde.
  const playableCategories = allNonKgCategories.filter((c) => c.deviceCount > 0);
  // Eine Nachschlage-Menge statt einer linearen Suche je Kategorie — dieselbe Frage wird unten für
  // die nicht getragenen Kategorien noch einmal gestellt.
  const categoriesWithActiveSession = new Set(wearSessions.map((s) => s.categoryId));
  const incompleteCategories = allNonKgCategories.filter((c) =>
    categoryNeedsDevice({ ...c, hasActiveSession: categoriesWithActiveSession.has(c.id) }),
  );
  const wearPairsByCategory = wearHourPairsByCategory(wearSessionList, now);

  // ── Serialize for client ──
  const orgasmusVorgabeLabel = offeneOrgasmusAnf?.vorgegebeneArt
    ? resolveReasonLabel(offeneOrgasmusAnf.vorgegebeneArt, orgasmCfg, "orgasm", tOrgasm)
    : null;

  const alertProps: DashboardAlertsProps = {
    tz,

    offeneKontrollen: offeneKontrollen.map((k) => ({
      id: k.id,
      deadline: k.deadline.toISOString(),
      code: k.code,
      kommentar: k.kommentar,
      target: inspectionTargetLabel(k),
      overdue: k.deadline < now,
      href: inspectionHref(k.code, { kommentar: k.kommentar, categoryId: k.categoryId }),
    })),

    offeneVerschlussAnf: offeneVerschlussAnf ? {
      nachricht: joinParts(
        offeneVerschlussAnf.device ? t("lockDevicePrefix", { name: offeneVerschlussAnf.device.name }) : null,
        offeneVerschlussAnf.nachricht,
      ),
      endetAtLabel: offeneVerschlussAnf.endetAt ? t("lockUntil", { date: formatDateTime(offeneVerschlussAnf.endetAt, dl, tz) }) : null,
    } : null,

    offeneOrgasmusAnf: offeneOrgasmusAnf ? {
      label: offeneOrgasmusAnf.art === "ANWEISUNG" ? t("orgasmInstructed") : t("orgasmOpportunity"),
      nachricht: joinParts(
        orgasmusVorgabeLabel ? t("orgasmRequiredArt", { art: orgasmusVorgabeLabel }) : null,
        offeneOrgasmusAnf.nachricht,
      ),
      windowLabel: t("orgasmWindowFromUntil", { from: formatDateTime(offeneOrgasmusAnf.beginntAt, dl, tz), until: formatDateTime(offeneOrgasmusAnf.endetAt, dl, tz) }),
    } : null,
  };

  const clientProps: DashboardProps = {
    currentStatus,
    cleaningPauseUntil: cleaningPauseUntil?.toISOString() ?? null,
    hasEntries: entries.length > 0,

    tagH,
    wocheH,
    monatH,
    serverNow: now.toISOString(),
    elapsedTagH: (now.getTime() - getMidnightToday(now, tz).getTime()) / 3_600_000,
    elapsedWocheH: (now.getTime() - getWeekStart(now, tz).getTime()) / 3_600_000,
    elapsedMonatH: (now.getTime() - getMonthStart(now, tz).getTime()) / 3_600_000,
  };

  const username = session.user.name ?? "";

  return (
    // Der Abstand zwischen den Blöcken kommt AUSSCHLIESSLICH von diesem `gap-4`, nie aus pt-/pb- der
    // Blöcke selbst — Begründung in `DashboardBlock`.
    <div className="flex flex-col gap-4 py-6">
      <DashboardBlock>
        <h1 className="text-xl font-bold text-foreground">{t("userTitle", { name: username })}</h1>
      </DashboardBlock>
      {/* Anforderungen mit Frist vor allem anderen — auch vor der Box-Karte. */}
      <DashboardAlerts {...alertProps} />
      {heimdallEnabled() && <BoxStatusCard tz={tz} reinigung={boxReinigung} />}
      <OpenTasks tasks={taskCards} tz={tz} />
      {/* UNTER den Aufgaben: eine Aufgabe mit Frist tickt, eine offene Strafe ist ein Zustand.
          Der Block lädt selbst — sonst müsste diese Seite dieselbe Auflösung noch einmal aufrufen,
          nur um sie durchzureichen. Deshalb in
          `Suspense`: sein Laden hängt sonst als weitere serielle Phase am Seiten-Rendering, und die
          ganze Seite wartete auf einen Block, den die meisten Nutzer nie zu sehen bekommen.
          `dashboardTaskIds` = die Aufgaben, die oben tatsächlich stehen — daran entscheidet der
          Block, ob eine Strafaufgabe hier zu wiederholen wäre. */}
      <Suspense fallback={null}>
        <OpenPenalties userId={userId} tz={tz} now={now} dashboardTaskIds={new Set(taskCards.map((c) => c.id))} />
      </Suspense>
      {showLaufendeSession && (
        <DashboardBlock>
          <LaufendeSessionCard
            sessionStart={activePair.verschluss.startTime}
            interruptionPausedMs={interruptionPauseMs(activePair.interruptions)}
            now={now}
            events={rawSessionEvents}
            sperrzeitEndetAt={activeSperrzeit?.endetAt ?? null}
            sperrzeitUnbefristet={!!activeSperrzeit && activeSperrzeit.endetAt === null}
            sperrzeitNachricht={activeSperrzeit?.nachricht ?? null}
            // Sub-Sicht: nur wenn er grundsätzlich reinigen darf. Sonst verspräche die Zeile etwas,
            // das seine Benutzer-Einstellung ohnehin verbietet.
            cleaningNote={
              activeSperrzeit && userSettings?.reinigungErlaubt
                ? t(activeSperrzeit.reinigungErlaubt ? "cleaningNoteAllowed" : "cleaningNoteForbidden")
                : null
            }
            keyInBox={activePair.verschluss.keyInBox ?? null}
            activeVorgabe={activeVorgabe ? proratedVorgabeTargets(activeVorgabe, now, tz) : null}
            tagH={tagH}
            wocheH={wocheH}
            monatH={monatH}
            jahrH={jahrH}
            tz={tz}
            userHasDevices={userHasDevices}
          />
        </DashboardBlock>
      )}
      <ActiveWearSessions
        sessions={wearSessions.map((s) => ({
          categoryId: s.categoryId,
          categoryName: s.categoryName,
          categoryColor: s.categoryColor,
          categoryIcon: s.categoryIcon,
          deviceName: s.deviceName,
          since: s.since.toISOString(),
          heldReason: isSessionHeldByTask(s.categoryId, s.deviceId) ? tTasks("heldByTask") : null,
          imageUrl: s.imageUrl,
        }))}
        serverNow={now.toISOString()}
      />
      {flagOn && <CategoriesPromoCard show={allNonKgCategories.length === 0} />}
      {/* Ohne Gerät ist die Kategorie ein halber Schritt, kein Zustand — sichtbar hier statt unten
          im eingeklappten „Nicht getragen" (Issue #49). Ohne Feature-Flag ist die Liste leer, der
          Block blendet sich selbst aus. */}
      <IncompleteCategories categories={incompleteCategories} />
      <CategoryGoalsToday
        userId={userId}
        activeWearSessions={wearSessions}
        entries={entries}
        includeCategories={flagOn}
        kgGoal={inlineKgGoal}
      />
      <InactiveCategories
        categories={playableCategories
          .filter((c) => !categoriesWithActiveSession.has(c.id))
          .map((c) => ({
            ...c,
            todayHours: wearingHoursFromPairs(
              wearPairsByCategory.get(c.id) ?? [],
              getMidnightToday(now, tz),
              now,
            ),
          }))}
      />
      <DashboardClient {...clientProps} />
      {pairs.length > 0 && (
        <DashboardBlock>
          <SessionList pairs={pairs} orgasmusEntries={orgasmusEntries} userHasDevices={userHasDevices} tz={tz} orgasmusArtenConfig={userSettings?.orgasmusArtenConfig} oeffnenGruendeConfig={userSettings?.oeffnenGruendeConfig} telemetryKeyProof={telemetryKeyProof} />
        </DashboardBlock>
      )}
      {wearSessionRows.length > 0 && (
        <DashboardBlock>
          <WearSessionList sessions={wearSessionRows} />
        </DashboardBlock>
      )}
      {/* Der ganze Bestand — hier unten bei den übrigen Historien-Listen, nicht oben bei dem, was
          gerade zu tun ist. */}
      {taskListCards.length > 0 && (
        <DashboardBlock>
          <TaskList tasks={taskListCards} tz={tz} />
        </DashboardBlock>
      )}
    </div>
  );
}
