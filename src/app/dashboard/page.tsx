import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime, formatHours,
  buildPairs, getOpenPair, interruptionPauseMs, buildKontrolleItems,
  toDateLocale, calculateWearingHoursByRange,
  getMidnightToday, getWeekStart, getMonthStart,
  wearingHoursFromPairs, APP_TZ,
  type ReinigungSettings,
} from "@/lib/utils";
import { buildWearSessions, wearHourPairsByCategory } from "@/lib/sessionModel";
import { buildWearSessionRows } from "@/lib/wearSessionRows";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions, getNonKgTrackingCategories, getActiveOrgasmusAnforderung, aktiveKontrolleWhere, getOpenLockRequest } from "@/lib/queries";
import { deviceCategoriesEnabled, heimdallEnabled } from "@/lib/constants";
import { buildBoxReinigungView } from "@/lib/boxReinigung";
import { loadTelemetryKeyProof } from "@/lib/boxKeyProof";
import { effectiveOrgasmusArten, resolveReasonLabel, resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { getTranslations, getLocale } from "next-intl/server";
import DashboardClient, { type DashboardProps } from "./DashboardClient";
import LaufendeSessionCard from "./LaufendeSessionCard";
import SessionList from "./SessionList";
import WearSessionList from "./WearSessionList";
import ActiveWearSessions from "./ActiveWearSessions";
import CategoriesPromoCard from "./CategoriesPromoCard";
import CategoryGoalsToday from "./CategoryGoalsToday";
import InactiveCategories from "./InactiveCategories";
import BoxStatusCard from "@/app/components/BoxStatusCard";
import DashboardBlock from "@/app/components/DashboardBlock";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const t = await getTranslations("dashboard");
  const tOrgasm = await getTranslations("orgasmForm");
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
    prisma.kontrollAnforderung.findMany({ where: { userId, ...aktiveKontrolleWhere(now) }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    getActiveVorgabe(userId, now),
    // Zeitversetzt geplante Anforderungen (wirksamAb in der Zukunft) bleiben für den Sub unsichtbar.
    // Bei mehreren offenen zeigt das Banner die dringendste — ein Verschluss erfüllt ohnehin alle.
    getOpenLockRequest(userId, now),
    getActiveSperrzeit(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true, orgasmusArtenConfig: true, oeffnenGruendeConfig: true } }),
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
  const offeneKontrolle = alleAnforderungen.find(k => !k.entryId && !k.withdrawnAt) ?? null;

  const latest = [...entries]
    .filter((e) => ["VERSCHLUSS", "OEFFNEN"].includes(e.type))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;

  const currentStatus = latest
    ? { type: latest.type as "VERSCHLUSS" | "OEFFNEN", since: latest.startTime.toISOString() }
    : null;

  // ── Build kontroll items for session events ──
  const kontrollItems = buildKontrolleItems(alleAnforderungen, entries.filter(e => e.type === "PRUEFUNG"), now);
  const pairs = buildPairs(entries, kontrollItems, reinigung);
  const activePair = getOpenPair(pairs);

  const orgasmusEntries = entries
    .filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // ── Box-Abfragen (beide zusammen) ──
  // Die Reinigungs-Regeln der Box-Karte (Begründung in `buildBoxReinigungView`) und der
  // Schlüssel-Nachweis aus der Telemetrie (`boxKeyProof.ts`) — beide brauchen die DB, keiner den
  // anderen.
  const [boxReinigung, telemetryKeyProof] = await Promise.all([
    buildBoxReinigungView(userSettings, activeSperrzeit, now, tz),
    loadTelemetryKeyProof(userId, pairs),
  ]);

  const orgasmCfg = effectiveOrgasmusArten(userSettings?.orgasmusArtenConfig);
  const rawSessionEvents = activePair
    ? buildSessionEvents(activePair, orgasmusEntries, dl, (art) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm), telemetryKeyProof)
    : [];

  const { tagH, wocheH, monatH, jahrH } = calculateWearingHoursByRange(entries, now);

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
  const wearPairsByCategory = wearHourPairsByCategory(wearSessionList, now);

  // ── Serialize for client ──
  const kontrolleOverdue = offeneKontrolle ? offeneKontrolle.deadline < now : false;
  const kontrolleHref = offeneKontrolle
    ? `/dashboard/new/pruefung?code=${offeneKontrolle.code}${offeneKontrolle.kommentar ? `&kommentar=${encodeURIComponent(offeneKontrolle.kommentar)}` : ""}`
    : "";

  const anfOverdue = offeneVerschlussAnf ? (offeneVerschlussAnf.endetAt ? offeneVerschlussAnf.endetAt < now : false) : false;

  const orgasmusVorgabeLabel = offeneOrgasmusAnf?.vorgegebeneArt
    ? resolveReasonLabel(offeneOrgasmusAnf.vorgegebeneArt, orgasmCfg, "orgasm", tOrgasm)
    : null;

  const clientProps: DashboardProps = {
    currentStatus,
    hasEntries: entries.length > 0,

    offeneKontrolle: offeneKontrolle ? {
      deadline: offeneKontrolle.deadline.toISOString(),
      code: offeneKontrolle.code,
      kommentar: offeneKontrolle.kommentar,
      overdue: kontrolleOverdue,
      href: kontrolleHref,
    } : null,

    offeneVerschlussAnf: offeneVerschlussAnf ? {
      endetAt: offeneVerschlussAnf.endetAt?.toISOString() ?? null,
      nachricht: offeneVerschlussAnf.nachricht,
      overdue: anfOverdue,
      endetAtLabel: offeneVerschlussAnf.endetAt ? t("lockUntil", { date: formatDateTime(offeneVerschlussAnf.endetAt, dl, tz) }) : null,
      deviceName: offeneVerschlussAnf.device?.name ?? null,
    } : null,

    activeSperrzeit: activeSperrzeit ? {
      endetAt: activeSperrzeit.endetAt?.toISOString() ?? null,
      nachricht: activeSperrzeit.nachricht,
      endetAtLabel: activeSperrzeit.endetAt ? t("openingForbiddenUntil", { date: formatDateTime(activeSperrzeit.endetAt, dl, tz) }) : null,
    } : null,

    offeneOrgasmusAnf: offeneOrgasmusAnf ? {
      label: offeneOrgasmusAnf.art === "ANWEISUNG" ? t("orgasmInstructed") : t("orgasmOpportunity"),
      nachricht: [orgasmusVorgabeLabel ? t("orgasmRequiredArt", { art: orgasmusVorgabeLabel }) : null, offeneOrgasmusAnf.nachricht].filter(Boolean).join(" · ") || null,
      windowLabel: t("orgasmWindowFromUntil", { from: formatDateTime(offeneOrgasmusAnf.beginntAt, dl, tz), until: formatDateTime(offeneOrgasmusAnf.endetAt, dl, tz) }),
    } : null,

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
      {heimdallEnabled() && <BoxStatusCard tz={tz} reinigung={boxReinigung} />}
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
          imageUrl: s.imageUrl,
        }))}
        serverNow={now.toISOString()}
      />
      {flagOn && <CategoriesPromoCard show={allNonKgCategories.length === 0} />}
      <CategoryGoalsToday
        userId={userId}
        activeWearSessions={wearSessions}
        entries={entries}
        includeCategories={flagOn}
        kgGoal={inlineKgGoal}
      />
      <InactiveCategories
        categories={allNonKgCategories
          .filter((c) => !wearSessions.some((s) => s.categoryId === c.id))
          .map((c) => ({
            ...c,
            todayHours: wearingHoursFromPairs(
              wearPairsByCategory.get(c.id) ?? [],
              getMidnightToday(now, tz),
              now,
            ),
          }))}
      />
      <DashboardClient {...clientProps} tz={tz} />
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
    </div>
  );
}
