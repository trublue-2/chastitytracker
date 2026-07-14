import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime, formatHours,
  buildPairs, interruptionPauseMs, buildKontrolleItems,
  toDateLocale, calculateWearingHoursByRange,
  getMidnightToday, getWeekStart, getMonthStart,
  buildWearPairs, wearingHoursFromPairs, WEAR_PAIR, APP_TZ,
  type ReinigungSettings,
} from "@/lib/utils";
import { buildWearSessionRows } from "@/lib/wearSessionRows";
import { proratedVorgabeTargets } from "@/lib/goalFulfillment";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions, getNonKgTrackingCategories, getActiveOrgasmusAnforderung, aktiveKontrolleWhere, activeVerschlussAnforderungWhere, cleaningBlockReason } from "@/lib/queries";
import { deviceCategoriesEnabled, heimdallEnabled } from "@/lib/constants";
import { buildReinigungView, reinigungVerbrauchtHeute, nextReinigungsFenster } from "@/lib/reinigungService";
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
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null, ...activeVerschlussAnforderungWhere(now) },
      include: { device: { select: { name: true } } },
    }),
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

  // Reinigungs-Regeln für die Box-Karte: einmal je Seitenaufbau, nicht im 5s-Poll. Dieselbe Quelle
  // wie `get_context.cleaning` im MCP — der Sub sah die Fenster bisher nirgends. `blockedBy` kommt
  // aus derselben Regel wie die Durchsetzung und kennt als einziges die AKTIVE Sperrzeit: ohne es
  // versprach die Karte Fenster, die eine reinigungsverbietende Sperre längst gesperrt hatte.
  const jetzt = new Date();
  const boxReinigung = heimdallEnabled() && userSettings
    ? {
        ...buildReinigungView(userSettings, await reinigungVerbrauchtHeute(userId, jetzt, tz), jetzt, tz),
        nextWindow: nextReinigungsFenster(userSettings.reinigungsFenster, jetzt, tz),
        blockedBy: cleaningBlockReason(
          { reinigungErlaubt: userSettings.reinigungErlaubt, reinigungsFenster: userSettings.reinigungsFenster, timezone: tz },
          activeSperrzeit ? [activeSperrzeit] : [],
          jetzt,
        ),
      }
    : null;

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
  const activePair = pairs.find((p) => p.active) ?? null;

  const orgasmusEntries = entries
    .filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  const orgasmCfg = effectiveOrgasmusArten(userSettings?.orgasmusArtenConfig);
  const rawSessionEvents = activePair
    ? buildSessionEvents(activePair, orgasmusEntries, dl, (art) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm))
    : [];

  const { tagH, wocheH, monatH, jahrH } = calculateWearingHoursByRange(entries, now, reinigung);

  const wearSessionRows = buildWearSessionRows(allNonKgCategories, entries, now, dl);

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
    <>
      <div className="w-full max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-xl font-bold text-foreground">{t("userTitle", { name: username })}</h1>
      </div>
      {heimdallEnabled() && <BoxStatusCard tz={tz} reinigung={boxReinigung} />}
      {activePair && rawSessionEvents.length > 0 && (
        <div className="w-full max-w-2xl mx-auto px-4 pt-6 pb-2">
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
            activeVorgabe={activeVorgabe ? proratedVorgabeTargets(activeVorgabe, now, tz) : null}
            tagH={tagH}
            wocheH={wocheH}
            monatH={monatH}
            jahrH={jahrH}
            tz={tz}
          />
        </div>
      )}
      <ActiveWearSessions
        sessions={wearSessions.map((s) => ({
          categoryId: s.categoryId,
          categoryName: s.categoryName,
          categoryColor: s.categoryColor,
          categoryIcon: s.categoryIcon,
          deviceName: s.deviceName,
          since: s.since.toISOString(),
        }))}
        serverNow={now.toISOString()}
      />
      {flagOn && <CategoriesPromoCard show={allNonKgCategories.length === 0} />}
      {flagOn && <CategoryGoalsToday userId={userId} activeWearSessions={wearSessions} />}
      <InactiveCategories
        categories={allNonKgCategories
          .filter((c) => !wearSessions.some((s) => s.categoryId === c.id))
          .map((c) => ({
            ...c,
            todayHours: wearingHoursFromPairs(
              buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: c.id }),
              getMidnightToday(now, tz),
              now,
            ),
          }))}
      />
      <DashboardClient {...clientProps} tz={tz} />
      {pairs.length > 0 && (
        <div className="w-full max-w-2xl mx-auto px-4 pb-6">
          <SessionList pairs={pairs} orgasmusEntries={orgasmusEntries} userHasDevices={userHasDevices} tz={tz} orgasmusArtenConfig={userSettings?.orgasmusArtenConfig} oeffnenGruendeConfig={userSettings?.oeffnenGruendeConfig} />
        </div>
      )}
      {wearSessionRows.length > 0 && (
        <div className="w-full max-w-2xl mx-auto px-4 pb-6">
          <WearSessionList sessions={wearSessionRows} />
        </div>
      )}
    </>
  );
}
