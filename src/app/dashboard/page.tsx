import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime, formatHours,
  buildPairs, interruptionPauseMs,
  toDateLocale, calculateWearingHoursByRange,
  type ReinigungSettings,
} from "@/lib/utils";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { getActiveVorgabe } from "@/lib/queries";
import { getTranslations, getLocale } from "next-intl/server";
import DashboardClient, { type DashboardProps } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const t = await getTranslations("dashboard");
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  // ── Parallel data fetch ──
  const [entries, alleAnforderungen, activeVorgabe, offeneVerschlussAnf, activeSperrzeit, userSettings] = await Promise.all([
    prisma.entry.findMany({ where: { userId }, orderBy: { startTime: "desc" } }),
    prisma.kontrollAnforderung.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    getActiveVorgabe(userId, now),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true } }),
  ]);

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
  const { buildKontrolleItems } = await import("@/lib/utils");
  const kontrollItems = buildKontrolleItems(alleAnforderungen, entries.filter(e => e.type === "PRUEFUNG"), now);
  const pairs = buildPairs(entries, kontrollItems, reinigung);
  const activePair = pairs.find((p) => p.active) ?? null;

  const orgasmusEntries = entries
    .filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  const rawSessionEvents = activePair ? buildSessionEvents(activePair, orgasmusEntries, dl) : [];

  const { tagH, wocheH, monatH } = calculateWearingHoursByRange(entries, !!activePair, now, reinigung);

  // ── Serialize for client ──
  const kontrolleOverdue = offeneKontrolle ? offeneKontrolle.deadline < now : false;
  const kontrolleHref = offeneKontrolle
    ? `/dashboard/new/pruefung?code=${offeneKontrolle.code}${offeneKontrolle.kommentar ? `&kommentar=${encodeURIComponent(offeneKontrolle.kommentar)}` : ""}`
    : "";

  const anfOverdue = offeneVerschlussAnf ? (offeneVerschlussAnf.endetAt ? offeneVerschlussAnf.endetAt < now : false) : false;

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
      endetAtLabel: offeneVerschlussAnf.endetAt ? t("lockUntil", { date: formatDateTime(offeneVerschlussAnf.endetAt, dl) }) : null,
    } : null,

    activeSperrzeit: activeSperrzeit ? {
      endetAt: activeSperrzeit.endetAt?.toISOString() ?? null,
      nachricht: activeSperrzeit.nachricht,
      endetAtLabel: activeSperrzeit.endetAt ? t("openingForbiddenUntil", { date: formatDateTime(activeSperrzeit.endetAt, dl) }) : null,
    } : null,

    sessionEvents: rawSessionEvents.map(e => ({
      id: e.entryId ?? `event-${e.time.getTime()}`,
      type: (e.type === "kontrolle" ? "PRUEFUNG" : e.type.toUpperCase()) as DashboardProps["sessionEvents"][number]["type"],
      time: e.time.toISOString(),
      note: e.note ?? undefined,
    })),
    sessionActive: !!activePair,

    tagH,
    wocheH,
    monatH,

    activeVorgabe: activeVorgabe ? {
      minProTagH: activeVorgabe.minProTagH,
      minProWocheH: activeVorgabe.minProWocheH,
      minProMonatH: activeVorgabe.minProMonatH,
    } : null,

    recentEntries: entries.slice(0, 5).map(e => ({
      id: e.id,
      type: e.type,
      startTime: e.startTime.toISOString(),
      note: e.note,
    })),
  };

  return <DashboardClient {...clientProps} />;
}
