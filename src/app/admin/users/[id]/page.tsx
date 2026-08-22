import { CLEANING_RULE_CHANGE_SELECT, cleaningRulesFrom, reinigungRulesAt } from "@/lib/cleaningRules";
import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import {
  formatDateTimeDual, formatDate, formatTime, formatDurationMs, toDateLocale, APP_TZ,
  formatTotalHours, formatTotalMs,
  buildPairs, getOpenPair, interruptionPauseMs, isTimeCorrected,
  buildKontrolleItems, calculateWearingHoursByRange,
} from "@/lib/utils";
import { buildWearSessionRows } from "@/lib/wearSessionRows";
import { buildWearSessions } from "@/lib/sessionModel";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { getActiveVorgabe, getKeyholderSperrzeit, getKeyholderOrgasmusAnforderung, getActiveWearSessions, getNonKgTrackingCategories, keyholderVisibleKontrolleWhere, isScheduledDirective } from "@/lib/queries";
import { deviceCategoriesEnabled, heimdallEnabled, orgasmusAnforderungArtLabel } from "@/lib/constants";
import { buildBoxReinigungView } from "@/lib/boxReinigung";
import { loadTelemetryKeyProof } from "@/lib/boxKeyProof";
import { effectiveOrgasmusArten, resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { ANFORDERUNG_PILLS, VERIFIKATION_PILLS } from "@/lib/kontrollePills";
import LaufendeSessionCard from "@/app/dashboard/LaufendeSessionCard";
import StatusBanner from "@/app/dashboard/StatusBanner";
import ActiveWearSessions from "@/app/dashboard/ActiveWearSessions";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";
import { KONTROLLE_TARGET_INCLUDE } from "@/lib/queries";
import KontrolleItemListClient, { type KontrolleItemData } from "@/app/components/KontrolleItemListClient";
import OrgasmenListClient, { type OrgasmusItemData } from "@/app/components/OrgasmenListClient";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import WithdrawButton from "@/app/admin/WithdrawButton";
import SessionList from "@/app/dashboard/SessionList";
import WearSessionList from "@/app/dashboard/WearSessionList";
import TaskList from "@/app/dashboard/TaskList";
import TaskCardStack from "@/app/components/TaskCardStack";
import KeyholderTaskCard from "@/app/admin/tasks/KeyholderTaskCard";
import { getEvaluatedTaskHistory, belongsOnDashboard, loadTaskProofViews } from "@/lib/taskIntervals";
import { toTaskCard } from "@/lib/taskView";
import CategoryGoalsToday from "@/app/dashboard/CategoryGoalsToday";
import BoxStatusCard from "@/app/components/BoxStatusCard";
import Card from "@/app/components/Card";
import Link from "next/link";
import { ClipboardList, Droplets, ChevronRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

export default async function AdminUserOverview({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const t = await getTranslations("admin");
  const ts = await getTranslations("stats");
  const td = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tOrgasm = await getTranslations("orgasmForm");
  const tTasks = await getTranslations("tasks");
  const dl = toDateLocale(await getLocale());

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{t("userNotFound")}</div>;
  const tz = user.timezone;
  // Betrachter-Zeitzone (Keyholder): Zeit-Widgets primär in dieser tz, Sub-Lokalzeit als Zusatz bei
  // Abweichung. `tz` (Sub) bleibt die Basis; `subLabel` beschriftet den Zusatz.
  const viewerTz = session?.user?.timezone ?? APP_TZ;
  const subLabel = t("subTimePrefix");
  const fmtDual = (d: Date) => formatDateTimeDual(d, dl, viewerTz, tz, subLabel);
  // Der Sub (Eintrag-Owner) governt die Anzeige-Labels seiner Orgasmus-/Öffnungs-Codes.
  const orgasmCfg = effectiveOrgasmusArten(user.orgasmusArtenConfig);

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}`);
  const now = new Date();

  const flagOn = deviceCategoriesEnabled();
  const [entries, alleAnforderungen, activeVorgabe, activeSperrzeit, offeneOrgasmusAnforderung, wearSessions, allNonKgCategories, deviceCount, cleaningChanges] = await Promise.all([
    prisma.entry.findMany({ where: { userId: id }, orderBy: { startTime: "desc" }, include: { device: { select: { id: true, name: true, categoryId: true } } } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id, ...keyholderVisibleKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
      // Ziel-Namen fürs Banner (v5.0.1) — sonst stünde dort „Kontrolle offen", ohne wofür.
      include: { entry: true, ...KONTROLLE_TARGET_INCLUDE },
    }),
    getActiveVorgabe(id, now),
    getKeyholderSperrzeit(id),
    getKeyholderOrgasmusAnforderung(id),
    flagOn ? getActiveWearSessions(id) : Promise.resolve([]),
    flagOn ? getNonKgTrackingCategories(id) : Promise.resolve([]),
    prisma.device.count({ where: { userId: id, archivedAt: null } }),
    prisma.cleaningRuleChange.findMany({ where: { userId: id }, select: CLEANING_RULE_CHANGE_SELECT }),
  ]);
  const userHasDevices = deviceCount > 0;

  // Fassung zur Tatzeit statt heutiger Stand — Begründung am Modell `CleaningRuleChange`.
  const reinigung = reinigungRulesAt(cleaningRulesFrom(cleaningChanges, user));
  // Aktiv offene Kontrolle für das grosse Banner — geplante (wirksamAb in der Zukunft) ausschliessen:
  // die erscheinen unten in der Kontroll-Liste mit "geplant"-Pill, nicht als aktiver Alarm.
  const offeneKontrolle = alleAnforderungen.find(
    k => !k.entryId && !k.withdrawnAt && !isScheduledDirective(k.wirksamAb, now),
  ) ?? null;

  const kontrollItems = buildKontrolleItems(alleAnforderungen, entries.filter(e => e.type === "PRUEFUNG"), now);

  const latest = entries.find(e => ["VERSCHLUSS", "OEFFNEN"].includes(e.type)) ?? null;
  const currentStatus = latest
    ? { type: latest.type as "VERSCHLUSS" | "OEFFNEN", since: latest.startTime.toISOString() }
    : null;
  const isLocked = currentStatus?.type === "VERSCHLUSS";

  const pairs = buildPairs(entries, kontrollItems, reinigung);
  const completedPairs = pairs.filter(p => p.oeffnen);
  const totalMs = completedPairs.reduce(
    (s, p) => s + (p.oeffnen!.startTime.getTime() - p.verschluss.startTime.getTime()) - interruptionPauseMs(p.interruptions),
    0
  );
  const totalFormatted = completedPairs.length ? formatTotalMs(totalMs) : "–";

  const orgasmusEntries = entries
    .filter(e => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  const lastOrgasmus = orgasmusEntries[0] ?? null;
  const orgasmusFreiMs = lastOrgasmus ? now.getTime() - lastOrgasmus.startTime.getTime() : null;
  const orgasmusFreiDisplay = orgasmusFreiMs ? formatDurationMs(orgasmusFreiMs, dl) : null;

  const activePair = getOpenPair(pairs);
  const { tagH, wocheH, monatH, jahrH } = calculateWearingHoursByRange(entries, now, tz);
  // Ziele prorata auf die Überschneidung der Vorgabe mit der jeweiligen Periode (wie im Sub-Dashboard).
  const proratedVorgabe = activeVorgabe ? proratedVorgabeTargets(activeVorgabe, now, tz) : null;

  const wearSessionRows = buildWearSessionRows(allNonKgCategories, buildWearSessions(entries, now), dl, entries);

  // Reinigungs-Regeln der Box-Karte. `getKeyholderSperrzeit` zeigt auch eine erst GEPLANTE Sperre
  // (damit die Keyholderin sie stornieren kann) — für die Reinigungs-Frage zählt nur die bereits
  // wirksame, sonst meldet die Karte „durch Sperrzeit blockiert", bevor die Sperre überhaupt läuft.
  const effectiveSperrzeit = activeSperrzeit && !isScheduledDirective(activeSperrzeit.wirksamAb, now) ? activeSperrzeit : null;
  // Das Tageskontingent zählt aus den oben geladenen `entries` — ohne DB. Nur der Schlüssel-Nachweis
  // aus der Telemetrie (`boxKeyProof.ts`) fragt noch ab, damit die Keyholderin dieselben Pillen
  // sieht wie der Sub; deshalb hier kein `Promise.all` mehr.
  const boxReinigung = buildBoxReinigungView(user, entries, effectiveSperrzeit, now, tz);
  // Aufgaben — dieselbe Aufteilung wie im Sub-Dashboard: oben die Karten dessen, was ihn jetzt
  // etwas angeht, unten die ganze Liste. Ohne sie zeigte diese Übersicht alles ausser dem einen,
  // was der Keyholder selbst gestellt hat.
  // `entries` und die Reinigungs-Regeln stehen längst — durchreichen, statt dieselben Zeilen ein
  // zweites Mal zu laden und ein zweites Mal zu paaren. Parallel zum Schlüssel-Nachweis: die beiden
  // wissen nichts voneinander.
  const [telemetryKeyProof, evaluatedTasks] = await Promise.all([
    loadTelemetryKeyProof(user.id, pairs),
    getEvaluatedTaskHistory(id, now, {
      // Die Keyholder-Sicht: was sie für später geplant hat, gehört auf ihre Seite.
      audience: "keyholder",
      kgLabel: tTasks("requirementKgLocked"), kgEntries: entries, wearEntries: entries, reinigung,
    }),
  ]);
  const sessionEvents = activePair ? buildSessionEvents(activePair, orgasmusEntries, dl, (art) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm), telemetryKeyProof) : [];

  const taskProofViews = await loadTaskProofViews(evaluatedTasks.map((e) => e.task.id));
  // Ohne Deep-Links: es sind nicht seine Formulare. Was er tun kann, hängt `KeyholderTaskCard` an.
  const taskCard = (e: (typeof evaluatedTasks)[number]) => toTaskCard(e, false, taskProofViews.get(e.task.id) ?? []);
  const taskCards = evaluatedTasks.map(taskCard);
  // Nächste Frist zuerst (die Liste kommt absteigend, also umdrehen) — wie im Sub-Dashboard.
  const openTaskCards = evaluatedTasks.filter((e) => belongsOnDashboard(e, now)).reverse().map(taskCard);

  return (
    <>
      {/* Dieselbe Karte wie im Sub-Dashboard, an derselben Stelle (zuoberst): die Keyholderin sah
          den Box-Zustand bisher nirgends — weder Ist/Soll noch, ob die Box überhaupt noch funkt. */}
      {heimdallEnabled() && <BoxStatusCard userId={id} tz={tz} viewerTz={viewerTz} reinigung={boxReinigung} />}

      {/* Aufgaben an derselben Stelle wie beim Sub — über der Session-Karte. Eine Aufgabe mit Frist
          ist das Einzige hier, das in den nächsten Stunden zu einem Vergehen werden kann. */}
      <TaskCardStack>
        {openTaskCards.map((card) => (
          <KeyholderTaskCard key={card.id} task={card} viewerTz={viewerTz} subTz={tz} />
        ))}
      </TaskCardStack>

      {activePair ? (
        <LaufendeSessionCard
          sessionStart={activePair.verschluss.startTime}
          interruptionPausedMs={interruptionPauseMs(activePair.interruptions)}
          now={now}
          events={sessionEvents}
          sperrzeitEndetAt={activeSperrzeit?.endetAt ?? null}
          sperrzeitUnbefristet={!!activeSperrzeit && activeSperrzeit.endetAt === null && !activeSperrzeit.wirksamAb}
          sperrzeitNachricht={activeSperrzeit?.nachricht ?? null}
          sperrzeitScheduledFor={activeSperrzeit?.wirksamAb && activeSperrzeit.wirksamAb > now ? activeSperrzeit.wirksamAb : null}
          // Keyholder-Sicht: IMMER die Eigenschaft der Sperre, unabhängig von den Benutzer-
          // Einstellungen des Subs — sie hat das Flag gesetzt und prüft es hier.
          cleaningNote={activeSperrzeit ? t(activeSperrzeit.reinigungErlaubt ? "sperrzeitWithCleaning" : "sperrzeitWithoutCleaning") : null}
          keyInBox={activePair.verschluss.keyInBox ?? null}
          activeVorgabe={proratedVorgabe}
          tagH={tagH}
          wocheH={wocheH}
          monatH={monatH}
          jahrH={jahrH}
          tz={tz}
          userHasDevices={userHasDevices}
        />
      ) : (
        <StatusBanner type={currentStatus?.type ?? null} since={currentStatus?.since ?? null} tz={tz} />
      )}

      {wearSessions.length > 0 && (
        <ActiveWearSessions
          sessions={wearSessions.map((s) => ({
            categoryId: s.categoryId,
            categoryName: s.categoryName,
            categoryColor: s.categoryColor,
            categoryIcon: s.categoryIcon,
            deviceName: s.deviceName,
            since: s.since.toISOString(),
            imageUrl: s.imageUrl,
          }))}
          serverNow={now.toISOString()}
          adminUserId={id}
        />
      )}

      {offeneKontrolle && (
        <KontrolleBanner
          deadline={offeneKontrolle.deadline}
          code={offeneKontrolle.code}
          kommentar={offeneKontrolle.kommentar}
          target={inspectionTargetLabel(offeneKontrolle)}
          overdue={offeneKontrolle.deadline < now}
          variant="large"
          tz={tz}
          viewerTz={viewerTz}
        />
      )}

      {offeneOrgasmusAnforderung && (() => {
        // Eine noch nicht ausgelöste Anweisung bleibt SICHTBAR (die Keyholderin hat sie gestellt und
        // muss sie zurückziehen können), aber sie läuft nicht: kein Countdown auf ein Fenster, das
        // der Träger nicht kennt, und die Beschriftung sagt, wann sie kommt.
        const orgasmusScheduled = isScheduledDirective(offeneOrgasmusAnforderung.wirksamAb, now);
        const orgasmusExpired = !orgasmusScheduled && offeneOrgasmusAnforderung.endetAt < now;
        return (
          <LockRequestBanner
            variant="compact"
            colorScheme="orgasm"
            label={
              orgasmusAnforderungArtLabel(offeneOrgasmusAnforderung.art as "ANWEISUNG" | "GELEGENHEIT", t)
              + (orgasmusExpired ? ` · ${t("orgasmAnforderungExpired")}` : "")
              + (orgasmusScheduled ? ` · ${t("orgasmAnforderungScheduled", { time: fmtDual(offeneOrgasmusAnforderung.wirksamAb!) })}` : "")
            }
            overdue={orgasmusExpired}
            endetAt={orgasmusScheduled ? null : offeneOrgasmusAnforderung.endetAt}
            locale={dl}
            tz={tz}
            viewerTz={viewerTz}
            subTimePrefix={subLabel}
            withdrawAction={<WithdrawButton id={offeneOrgasmusAnforderung.id} apiPath="/api/admin/orgasmus-anforderung" title={t("withdrawOrgasmTitle")} colorToken="orgasm" />}
          />
        );
      })()}

      {/* Statistik kompakt */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("statsTitle")}</p>
          <Link href={`/admin/users/${id}/stats`} className="text-xs text-foreground-faint hover:text-foreground-muted transition">
            {t("allStats")} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-raised px-4 py-3">
            <p className="text-xs text-foreground-faint mb-0.5">{ts("entries")}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{pairs.length}</p>
          </div>
          <div className="rounded-xl bg-surface-raised px-4 py-3">
            <p className="text-xs text-foreground-faint mb-0.5">{ts("totalDuration")}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{totalFormatted}</p>
          </div>
          {orgasmusFreiDisplay !== null && (
            <div className="rounded-xl bg-orgasm-bg border border-orgasm-border px-4 py-3 col-span-2 sm:col-span-1">
              <p className="text-xs text-orgasm-text font-semibold mb-0.5 uppercase tracking-wider">{ts("orgasmFreeTime")}</p>
              <p className="text-2xl font-bold text-orgasm tracking-tight">{orgasmusFreiDisplay}</p>
              {lastOrgasmus && <p className="text-xs text-orgasm-text opacity-60 mt-0.5">{ts("lastOrgasm")}: {fmtDual(lastOrgasmus.startTime)}</p>}
            </div>
          )}
        </div>
      </Card>

      {activeVorgabe && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{ts("trainingGoals")}</p>
            <Link href={`/admin/users/${id}/einstellungen`} className="text-xs text-foreground-faint hover:text-foreground-muted transition flex items-center gap-0.5">
              {tc("all")} <ChevronRight size={12} />
            </Link>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-request-text bg-request-bg border border-request-border px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0">{t("vorgabeActive")}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {formatDate(activeVorgabe.gueltigAb, dl, tz)} → {activeVorgabe.gueltigBis ? formatDate(activeVorgabe.gueltigBis, dl, tz) : tc("open")}
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
      )}

      <CategoryGoalsToday userId={id} />

      <SessionList keyholderView pairs={pairs} orgasmusEntries={orgasmusEntries} userHasDevices={userHasDevices} tz={tz} orgasmusArtenConfig={user.orgasmusArtenConfig} oeffnenGruendeConfig={user.oeffnenGruendeConfig} telemetryKeyProof={telemetryKeyProof} />

      {wearSessionRows.length > 0 && <WearSessionList sessions={wearSessionRows} />}

      {/* Dieselbe Liste wie im Sub-Dashboard, an derselben Stelle: unten bei den Historien. Fristen
          stehen wie überall sonst auf dieser Seite in BEIDEN Zeitzonen — die Sub-Zeit trägt dazu ihr
          Präfix, sonst wechselte mitten in der Spalte stumm die Uhr. */}
      <TaskList tasks={taskCards} tz={tz} viewerTz={viewerTz} subLabel={subLabel} />

      {kontrollItems.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
              <ClipboardList size={12} />{ts("inspections")}
            </p>
            <Link href={`/admin/users/${id}/kontrollen`} className="text-xs text-foreground-faint hover:text-foreground-muted transition flex items-center gap-0.5">
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
                editHref: k.entryId ? `/dashboard/edit/${k.entryId}?from=admin&userId=${id}` : null,
                timeCorrectedStr: isTimeCorrected(k.time, k.submittedAt)
                  ? `${t("timeCorrected")} – ${t("givenLabel")}: ${fmtDual(k.time)} · ${t("systemLabel")}: ${fmtDual(k.submittedAt!)}`
                  : null,
              };
            })}
          />
        </Card>
      )}

      {orgasmusEntries.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
              <Droplets size={12} />{td("orgasms")}
            </p>
          </div>
          <OrgasmenListClient
            items={orgasmusEntries.slice(0, 5).map((e): OrgasmusItemData => ({
              id: e.id, dateStr: formatDate(e.startTime, dl, tz), timeStr: formatTime(e.startTime, dl, tz),
              orgasmusArt: resolveOrgasmusArtDisplay(e.orgasmusArt, orgasmCfg, tOrgasm), note: e.note, editHref: `/dashboard/edit/${e.id}?from=admin&userId=${id}`,
            }))}
          />
        </Card>
      )}
    </>
  );
}
