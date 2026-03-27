import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import {
  formatDuration, formatDateTime, formatDate, formatTime, formatHours, toDateLocale,
  wearingHoursInRange, buildPairs, interruptionPauseMs,
  mapAnforderungStatus, mapVerifikationStatus,
  getMidnightToday, getWeekStart, getMonthStart,
  type ReinigungSettings,
} from "@/lib/utils";
import { getActiveVorgabe } from "@/lib/queries";
import { ANFORDERUNG_PILLS, VERIFIKATION_PILLS } from "@/lib/kontrollePills";
import LaufendeSessionCard from "@/app/dashboard/LaufendeSessionCard";
import StatusBanner from "@/app/dashboard/StatusBanner";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import KontrolleItemListClient, { type KontrolleItemData } from "@/app/components/KontrolleItemListClient";
import OrgasmenListClient, { type OrgasmusItemData } from "@/app/components/OrgasmenListClient";
import SessionList from "@/app/dashboard/SessionList";
import Link from "next/link";
import { Lock, ClipboardList, Droplets, ChevronRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

type Entry = {
  id: string; type: string; startTime: Date; imageUrl: string | null;
  imageExifTime: Date | null; note: string | null; orgasmusArt: string | null;
  verifikationStatus: string | null; kontrollCode: string | null; oeffnenGrund: string | null;
};
type KontrolleItem = {
  id: string; time: Date; imageUrl: string | null; code: string | null;
  deadline: Date | null; kommentar: string | null; note: string | null;
  anforderungStatus: import("@/lib/utils").AnforderungStatus | null;
  verifikationStatus: import("@/lib/utils").VerifikationStatus | null;
  entryId: string | null; submittedAt: Date | null;
};

export default async function AdminUserOverview({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const t = await getTranslations("admin");
  const ts = await getTranslations("stats");
  const td = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const dl = toDateLocale(await getLocale());

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{t("userNotFound")}</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}`);
  const now = new Date();

  const [entries, alleAnforderungen, activeVorgabe, activeSperrzeit] = await Promise.all([
    prisma.entry.findMany({ where: { userId: id }, orderBy: { startTime: "desc" } }),
    prisma.kontrollAnforderung.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    getActiveVorgabe(id, now),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
    }),
  ]);

  const reinigung: ReinigungSettings = { erlaubt: user.reinigungErlaubt, maxMinuten: user.reinigungMaxMinuten };
  const offeneKontrolle = alleAnforderungen.find(k => !k.entryId && !k.withdrawnAt) ?? null;

  const linkedEntryIds = new Set(alleAnforderungen.map(k => k.entryId).filter(Boolean));
  const pruefungEntries = entries.filter(e => e.type === "PRUEFUNG");

  const kontrollItems: KontrolleItem[] = [
    ...alleAnforderungen.map(k => ({
      id: k.id, time: k.entry ? k.entry.startTime : k.createdAt,
      imageUrl: k.entry?.imageUrl ?? null, code: k.code, deadline: k.deadline,
      kommentar: k.kommentar ?? null, note: k.entry?.note ?? null,
      anforderungStatus: mapAnforderungStatus(k, k.entry?.startTime ?? null, now),
      verifikationStatus: k.entry ? mapVerifikationStatus(k.entry.verifikationStatus) : null,
      entryId: k.entry?.id ?? null, submittedAt: k.fulfilledAt ?? null,
    })),
    ...pruefungEntries.filter(e => !linkedEntryIds.has(e.id)).map(e => ({
      id: e.id, time: e.startTime, imageUrl: e.imageUrl, code: e.kontrollCode,
      deadline: null as Date | null, kommentar: null as string | null, note: e.note,
      anforderungStatus: null, verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
      entryId: e.id, submittedAt: null as Date | null,
    })),
  ];

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
  const totalFormatted = completedPairs.length ? formatDuration(new Date(0), new Date(totalMs), dl) : "–";

  const orgasmusEntries = entries
    .filter(e => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  const lastOrgasmus = orgasmusEntries[0] ?? null;
  const orgasmusFreiMs = lastOrgasmus ? now.getTime() - lastOrgasmus.startTime.getTime() : null;
  const orgasmusFreiDisplay = (() => {
    if (!orgasmusFreiMs) return null;
    const days = Math.floor(orgasmusFreiMs / 86_400_000);
    const hours = Math.floor((orgasmusFreiMs % 86_400_000) / 3_600_000);
    return days > 0 ? `${days}T ${hours}h` : `${hours}h`;
  })();

  const activePair = pairs.find(p => p.active) ?? null;
  const sessionEvents: import("@/app/dashboard/LaufendeSessionCard").SessionEvent[] = activePair
    ? [
        { type: "verschluss" as const, time: activePair.verschluss.startTime, imageUrl: activePair.verschluss.imageUrl, imageExifTime: activePair.verschluss.imageExifTime, note: activePair.verschluss.note, entryId: activePair.verschluss.id },
        ...activePair.kontrollen.filter(k => k.entryId !== null).map(k => ({
          type: "kontrolle" as const, time: k.time, imageUrl: k.imageUrl, imageExifTime: null, note: k.note,
          entryId: k.entryId, deadline: k.deadline, kontrolleKommentar: k.kommentar, kontrolleCode: k.code,
          kontrolleAnforderungStatus: k.anforderungStatus, kontrolleVerifikationStatus: k.verifikationStatus,
        })),
        ...orgasmusEntries.filter(e => e.startTime >= activePair.verschluss.startTime).map(e => ({
          type: "orgasmus" as const, time: e.startTime, imageUrl: e.imageUrl, imageExifTime: null,
          note: e.note, entryId: e.id, orgasmusArt: e.orgasmusArt,
        })),
        ...activePair.interruptions.map(intr => ({
          type: "reinigung" as const, time: intr.oeffnen.startTime, imageUrl: null, imageExifTime: null,
          note: intr.oeffnen.note, entryId: null, pauseDurationStr: formatDuration(intr.oeffnen.startTime, intr.verschluss.startTime, dl),
        })),
      ].sort((a, b) => a.time.getTime() - b.time.getTime())
    : [];

  const nowMidnight = getMidnightToday(now);
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);
  const tagH = activePair ? wearingHoursInRange(entries, nowMidnight, now, reinigung) : 0;
  const wocheH = activePair ? wearingHoursInRange(entries, weekStart, now, reinigung) : 0;
  const monatH = activePair ? wearingHoursInRange(entries, monthStart, now, reinigung) : 0;

  return (
    <main className="w-full max-w-5xl px-4 sm:px-6 py-6 flex flex-col gap-4">

      {/* ── Section 1: Status ── */}
      {activePair ? (
        <LaufendeSessionCard
          sessionStart={activePair.verschluss.startTime}
          interruptionPausedMs={interruptionPauseMs(activePair.interruptions)}
          now={now}
          events={sessionEvents}
          sperrzeitEndetAt={activeSperrzeit?.endetAt ?? null}
          sperrzeitUnbefristet={!!activeSperrzeit && activeSperrzeit.endetAt === null}
          sperrzeitNachricht={activeSperrzeit?.nachricht ?? null}
          activeVorgabe={activeVorgabe}
          tagH={tagH}
          wocheH={wocheH}
          monatH={monatH}
        />
      ) : (
        <StatusBanner type={currentStatus?.type ?? null} since={currentStatus?.since ?? null} />
      )}

      {/* ── Section 2: Offene Kontrolle ── */}
      {offeneKontrolle && (
        <KontrolleBanner
          deadline={offeneKontrolle.deadline}
          code={offeneKontrolle.code}
          kommentar={offeneKontrolle.kommentar}
          overdue={offeneKontrolle.deadline < now}
          variant="large"
        />
      )}

      {/* ── Section 3: Compliance (Statistik kompakt) ── */}
      <div className="bg-surface rounded-2xl border border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-3">{t("statsTitle")}</p>
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
              {lastOrgasmus && <p className="text-xs text-orgasm-text opacity-60 mt-0.5">{ts("lastOrgasm")}: {formatDateTime(lastOrgasmus.startTime, dl)}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Aktive Vorgabe ── */}
      {activeVorgabe && (
        <div className="bg-surface rounded-2xl border border-border px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{ts("trainingGoals")}</p>
            <Link href={`/admin/users/${id}/einstellungen`} className="text-xs text-foreground-faint hover:text-foreground-muted transition flex items-center gap-0.5">
              Alle <ChevronRight size={12} />
            </Link>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-request-text bg-request-bg border border-request-border px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0">{t("vorgabeActive")}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {formatDate(activeVorgabe.gueltigAb, dl)} → {activeVorgabe.gueltigBis ? formatDate(activeVorgabe.gueltigBis, dl) : tc("open")}
              </p>
              <div className="flex flex-wrap gap-3 mt-1">
                {activeVorgabe.minProTagH != null && <span className="text-xs text-foreground-muted">{td("day")}: <strong className="text-foreground">{formatHours(activeVorgabe.minProTagH, dl)}</strong></span>}
                {activeVorgabe.minProWocheH != null && <span className="text-xs text-foreground-muted">{td("week")}: <strong className="text-foreground">{formatHours(activeVorgabe.minProWocheH, dl)}</strong></span>}
                {activeVorgabe.minProMonatH != null && <span className="text-xs text-foreground-muted">{td("month")}: <strong className="text-foreground">{formatHours(activeVorgabe.minProMonatH, dl)}</strong></span>}
              </div>
              {activeVorgabe.notiz && <p className="text-xs text-foreground-faint italic mt-0.5">{activeVorgabe.notiz}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Section 6: Letzte Einträge ── */}
      <SessionList pairs={pairs} orgasmusEntries={orgasmusEntries} />

      {/* ── Section 7: Kontrollen ── */}
      {kontrollItems.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
              <ClipboardList size={12} />{ts("inspections")}
            </p>
            <Link href={`/admin/users/${id}/kontrollen`} className="text-xs text-foreground-faint hover:text-foreground-muted transition flex items-center gap-0.5">
              Alle <ChevronRight size={12} />
            </Link>
          </div>
          <KontrolleItemListClient
            imageAlt={ts("inspections")}
            items={[...kontrollItems].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5).map((k): KontrolleItemData => {
              const aPill = k.anforderungStatus ? ANFORDERUNG_PILLS[k.anforderungStatus] : null;
              const vPill = k.verifikationStatus ? VERIFIKATION_PILLS[k.verifikationStatus] : null;
              return {
                id: k.id, imageUrl: k.imageUrl, kommentar: k.kommentar,
                pill1Label: aPill ? t(aPill.labelKey) : null, pill1Cls: aPill?.cls ?? null,
                pill2Label: vPill ? t(vPill.labelKey) : null, pill2Cls: vPill?.cls ?? null,
                code: k.code, dateTimeStr: formatDateTime(k.time, dl), dateTimePrefix: null,
                deadlineStr: k.deadline ? formatDateTime(k.deadline, dl) : null,
                deadlinePrefix: t("frist"), note: null, entryId: k.entryId,
                editHref: k.entryId ? `/dashboard/edit/${k.entryId}` : null,
                timeCorrectedStr: k.submittedAt && k.time.getTime() < k.submittedAt.getTime() - 60_000
                  ? `${t("timeCorrected")} – ${t("givenLabel")}: ${formatDateTime(k.time, dl)} · ${t("systemLabel")}: ${formatDateTime(k.submittedAt, dl)}`
                  : null,
              };
            })}
          />
        </div>
      )}

      {/* ── Section 8: Orgasmus-Einträge ── */}
      {orgasmusEntries.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
              <Droplets size={12} />{td("orgasms")}
            </p>
          </div>
          <OrgasmenListClient
            items={orgasmusEntries.slice(0, 5).map((e): OrgasmusItemData => ({
              id: e.id, dateStr: formatDate(e.startTime, dl), timeStr: formatTime(e.startTime, dl),
              orgasmusArt: e.orgasmusArt, note: e.note, editHref: `/dashboard/edit/${e.id}`,
            }))}
          />
        </div>
      )}


    </main>
  );
}
