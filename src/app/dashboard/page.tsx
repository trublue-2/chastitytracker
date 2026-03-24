import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDuration, formatDateTime, formatDate, formatHours,
  wearingHoursInRange, buildPairs, interruptionPauseMs, photoStatus,
  mapAnforderungStatus, mapVerifikationStatus,
  getMidnightToday, getWeekStart, getMonthStart, toDateLocale,
  type ReinigungSettings,
} from "@/lib/utils";
import { getActiveVorgabe } from "@/lib/queries";
import { ANFORDERUNG_PILLS, getKombinierterPill } from "@/lib/kontrollePills";
import StatusBanner from "./StatusBanner";
import LaufendeSessionCard from "./LaufendeSessionCard";
import SessionList from "./SessionList";
import { Lock, ClipboardList, Droplets } from "lucide-react";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import KontrolleItemListClient, { type KontrolleItemData } from "@/app/components/KontrolleItemListClient";
import OrgasmenListClient, { type OrgasmusItemData } from "@/app/components/OrgasmenListClient";
import { getTranslations, getLocale } from "next-intl/server";

type Entry = {
  id: string;
  type: string;
  startTime: Date;
  imageUrl: string | null;
  imageExifTime: Date | null;
  note: string | null;
  orgasmusArt: string | null;
  verifikationStatus: string | null;
  kontrollCode: string | null;
  oeffnenGrund: string | null;
};

type KontrolleItem = {
  id: string;
  time: Date;
  imageUrl: string | null;
  code: string | null;
  deadline: Date | null;
  kommentar: string | null;
  note: string | null;
  anforderungStatus: import("@/lib/utils").AnforderungStatus | null;
  verifikationStatus: import("@/lib/utils").VerifikationStatus | null;
  entryId: string | null;
};

type Pair = {
  verschluss: Entry;
  oeffnen: Entry | null;
  active: boolean;
  kontrollen: KontrolleItem[];
  interruptions: { oeffnen: Entry; verschluss: Entry }[];
};


export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [t, tCommon, ta] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getTranslations("admin"),
  ]);

  const dl = toDateLocale(await getLocale());
  const now = new Date();
  const [entries, alleAnforderungen, activeVorgabe, offeneVerschlussAnf, activeSperrzeit, userSettings] = await Promise.all([
    prisma.entry.findMany({ where: { userId }, orderBy: { startTime: "desc" } }),
    prisma.kontrollAnforderung.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    getActiveVorgabe(userId, now),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "SPERRZEIT", withdrawnAt: null, endetAt: { gt: now } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true } }),
  ]);

  const reinigung: ReinigungSettings = {
    erlaubt: userSettings?.reinigungErlaubt ?? false,
    maxMinuten: userSettings?.reinigungMaxMinuten ?? 15,
  };

  const offeneKontrolle = alleAnforderungen.find(k => !k.entryId && !k.withdrawnAt) ?? null;

  // Build unified KontrolleItems
  const linkedEntryIds = new Set(alleAnforderungen.map(k => k.entryId).filter(Boolean));
  const pruefungEntries = entries.filter(e => e.type === "PRUEFUNG");

  const kontrollItems: KontrolleItem[] = [
    // KontrollAnforderungen (mit FK verknüpft)
    ...alleAnforderungen.map(k => ({
      id: k.id,
      time: k.entry ? k.entry.startTime : k.createdAt,
      imageUrl: k.entry?.imageUrl ?? null,
      code: k.code,
      deadline: k.deadline,
      kommentar: k.kommentar ?? null,
      note: k.entry?.note ?? null,
      anforderungStatus: mapAnforderungStatus(k, k.entry?.startTime ?? null, now),
      verifikationStatus: k.entry ? mapVerifikationStatus(k.entry.verifikationStatus) : null,
      entryId: k.entry?.id ?? null,
    })),
    // Standalone PRUEFUNG entries (ohne KontrollAnforderung)
    ...pruefungEntries
      .filter(e => !linkedEntryIds.has(e.id))
      .map(e => ({
        id: e.id,
        time: e.startTime,
        imageUrl: e.imageUrl,
        code: e.kontrollCode,
        deadline: null as Date | null,
        kommentar: null as string | null,
        note: e.note,
        anforderungStatus: null,
        verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
        entryId: e.id,
      })),
  ];

  const latest = [...entries]
    .filter((e) => ["VERSCHLUSS", "OEFFNEN"].includes(e.type))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;

  const currentStatus = latest
    ? { type: latest.type as "VERSCHLUSS" | "OEFFNEN", since: latest.startTime.toISOString() }
    : null;

  const pairs = buildPairs(entries, kontrollItems, reinigung);
  const verschluesse = entries.filter((e) => e.type === "VERSCHLUSS");
  const completedPairs = pairs.filter((p) => p.oeffnen);
  const totalMs = completedPairs.reduce(
    (s, p) => s + (p.oeffnen!.startTime.getTime() - p.verschluss.startTime.getTime()) - interruptionPauseMs(p.interruptions),
    0
  );
  const totalFormatted = completedPairs.length ? formatDuration(new Date(0), new Date(totalMs), dl) : "–";
  const orgasmusEntries = entries
    .filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // ── Laufende Session ──
  const activePair = pairs.find((p) => p.active) ?? null;

  const sessionEvents: import("./LaufendeSessionCard").SessionEvent[] = activePair
    ? [
        {
          type: "verschluss" as const,
          time: activePair.verschluss.startTime,
          imageUrl: activePair.verschluss.imageUrl,
          imageExifTime: activePair.verschluss.imageExifTime,
          note: activePair.verschluss.note,
          entryId: activePair.verschluss.id,
        },
        ...activePair.kontrollen
          .filter((k) => k.entryId !== null)
          .map((k) => ({
            type: "kontrolle" as const,
            time: k.time,
            imageUrl: k.imageUrl,
            imageExifTime: null,
            note: k.note,
            entryId: k.entryId,
            deadline: k.deadline,
            kontrolleKommentar: k.kommentar,
            kontrolleCode: k.code,
            kontrolleAnforderungStatus: k.anforderungStatus,
            kontrolleVerifikationStatus: k.verifikationStatus,
          })),
        ...orgasmusEntries
          .filter((e) => e.startTime >= activePair.verschluss.startTime)
          .map((e) => ({
            type: "orgasmus" as const,
            time: e.startTime,
            imageUrl: e.imageUrl,
            imageExifTime: null,
            note: e.note,
            entryId: e.id,
            orgasmusArt: e.orgasmusArt,
          })),
        ...activePair.interruptions.map((intr) => ({
          type: "reinigung" as const,
          time: intr.oeffnen.startTime,
          imageUrl: null,
          imageExifTime: null,
          note: intr.oeffnen.note,
          entryId: null,
          pauseDurationStr: formatDuration(intr.oeffnen.startTime, intr.verschluss.startTime, dl),
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
    <>
      <main className="flex-1 w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>

        {/* ── Status / Laufende Session ── */}
        {activePair ? (
          <LaufendeSessionCard
            sessionStart={activePair.verschluss.startTime}
            interruptionPausedMs={interruptionPauseMs(activePair.interruptions)}
            now={now}
            events={sessionEvents}
            sperrzeitEndetAt={activeSperrzeit?.endetAt ?? null}
            sperrzeitNachricht={activeSperrzeit?.nachricht ?? null}
            activeVorgabe={activeVorgabe}
            tagH={tagH}
            wocheH={wocheH}
            monatH={monatH}
          />
        ) : (
          <StatusBanner type={currentStatus?.type ?? null} since={currentStatus?.since ?? null} />
        )}

        {/* ── Verschluss-Anforderung Banner ── */}
        {offeneVerschlussAnf && (
          <div className="flex flex-col gap-1.5 bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-indigo-600 shrink-0" />
              <p className="text-sm font-bold text-indigo-800">{t("lockRequested")}</p>
            </div>
            {offeneVerschlussAnf.nachricht && (
              <p className="text-sm text-indigo-700">{offeneVerschlussAnf.nachricht}</p>
            )}
            {offeneVerschlussAnf.endetAt && (
              <p className="text-xs text-indigo-500">
                {t("lockUntil", { date: formatDateTime(offeneVerschlussAnf.endetAt, dl) })}
              </p>
            )}
          </div>
        )}

        {/* ── Sperrzeit Banner (nur wenn nicht verschlossen, da dann im Session-Header) ── */}
        {activeSperrzeit && !activePair && currentStatus?.type === "VERSCHLUSS" && (
          <div className="flex flex-col gap-1.5 bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-rose-600 shrink-0" />
              <p className="text-sm font-bold text-rose-800">{t("locked")}</p>
            </div>
            {activeSperrzeit.nachricht && (
              <p className="text-sm text-rose-700">{activeSperrzeit.nachricht}</p>
            )}
            {activeSperrzeit.endetAt && (
              <p className="text-xs text-rose-500">
                {t("openingForbiddenUntil", { date: formatDateTime(activeSperrzeit.endetAt, dl) })}
              </p>
            )}
          </div>
        )}

        {/* ── Kontrolle Banner ── */}
        {offeneKontrolle && (() => {
          const overdue = offeneKontrolle.deadline < new Date();
          const kommentarParam = offeneKontrolle.kommentar ? `&kommentar=${encodeURIComponent(offeneKontrolle.kommentar)}` : "";
          return (
            <KontrolleBanner
              deadline={offeneKontrolle.deadline}
              code={offeneKontrolle.code}
              kommentar={offeneKontrolle.kommentar}
              overdue={overdue}
              variant="large"
              href={`/dashboard/new/pruefung?code=${offeneKontrolle.code}${kommentarParam}`}
              openLabel={t("inspectionRequired")}
            />
          );
        })()}

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard label={t("entries")} value={String(pairs.length)} />
          <StatCard label={t("totalDuration")} value={totalFormatted} />
        </div>

        {/* ── Trainingsvorgabe ── */}
        {activeVorgabe && !activePair && (
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{t("trainingGoals")}</p>
            <div className="flex items-start gap-3">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0">{tCommon("active")}</span>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {formatDate(activeVorgabe.gueltigAb, dl)} → {activeVorgabe.gueltigBis ? formatDate(activeVorgabe.gueltigBis, dl) : tCommon("open")}
                </p>
                <div className="flex flex-wrap gap-3 mt-1">
                  {activeVorgabe.minProTagH != null && <span className="text-xs text-gray-600">{t("day")}: <strong>{formatHours(activeVorgabe.minProTagH, dl)}</strong> <span className="text-gray-400">({Math.round((activeVorgabe.minProTagH / 24) * 100)}%)</span></span>}
                  {activeVorgabe.minProWocheH != null && <span className="text-xs text-gray-600">{t("week")}: <strong>{formatHours(activeVorgabe.minProWocheH, dl)}</strong> <span className="text-gray-400">({Math.round((activeVorgabe.minProWocheH / 168) * 100)}%)</span></span>}
                  {activeVorgabe.minProMonatH != null && <span className="text-xs text-gray-600">{t("month")}: <strong>{formatHours(activeVorgabe.minProMonatH, dl)}</strong> <span className="text-gray-400">({Math.round((activeVorgabe.minProMonatH / 730) * 100)}%)</span></span>}
                </div>
                {activeVorgabe.notiz && <p className="text-xs text-gray-400 italic mt-0.5">{activeVorgabe.notiz}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Session-Liste ── */}
        <SessionList pairs={pairs} orgasmusEntries={orgasmusEntries} />

        {/* ── Einschluss-Liste (alt, ausgeblendet) ── */}
        {/*
        {pairs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
            {t("noEntries")}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-[80px_1fr_1fr] sm:grid-cols-[96px_1fr_1fr] lg:grid-cols-[96px_1fr_1fr_160px] border-b border-gray-100 px-5 py-3 gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t("photo")}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Lock size={11} />{t("lock")}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><LockOpen size={11} />{t("opening")}</span>
              <span className="hidden lg:block text-xs font-semibold uppercase tracking-wider text-gray-400">{t("duration")}</span>
            </div>

            <div className="divide-y divide-gray-50">
              {pairs.map(({ verschluss, oeffnen, active }) => {
                const ps = photoStatus(verschluss);
                const duration = oeffnen ? formatDuration(verschluss.startTime, oeffnen.startTime, dl) : null;
                return (
                  <PairRow
                    key={verschluss.id}
                    verschluss={{
                      id: verschluss.id,
                      startTime: verschluss.startTime.toISOString(),
                      imageUrl: verschluss.imageUrl,
                      imageExifTime: verschluss.imageExifTime?.toISOString() ?? null,
                      note: verschluss.note,
                      kontrollCode: verschluss.kontrollCode,
                      verifikationStatus: verschluss.verifikationStatus,
                      oeffnenGrund: verschluss.oeffnenGrund,
                    }}
                    oeffnen={oeffnen ? {
                      id: oeffnen.id,
                      startTime: oeffnen.startTime.toISOString(),
                      imageUrl: oeffnen.imageUrl,
                      imageExifTime: oeffnen.imageExifTime?.toISOString() ?? null,
                      note: oeffnen.note,
                      oeffnenGrund: oeffnen.oeffnenGrund,
                      kontrollCode: oeffnen.kontrollCode,
                      verifikationStatus: oeffnen.verifikationStatus,
                    } : null}
                    active={active}
                    duration={duration}
                    photoStatus={ps}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" /> {t("noPhoto")}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" /> {t("exifDeviation")}</span>
            </div>
          </div>
        )}
        */}

        {/* ── Offene Kontrollanforderungen ── */}
        {(() => {
          const offene = kontrollItems.filter(k => k.entryId === null && k.anforderungStatus !== "withdrawn").sort((a, b) => b.time.getTime() - a.time.getTime());
          if (!offene.length) return null;
          return (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><ClipboardList size={12} />Offene Anforderungen</p>
              </div>
              <div className="divide-y divide-gray-50">
                {offene.map((k) => {
                  const aPill = k.anforderungStatus ? ANFORDERUNG_PILLS[k.anforderungStatus] : null;
                  return (
                    <div key={k.id} className="px-4 py-3 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {aPill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${aPill.cls}`}>{ta(aPill.labelKey)}</span>}
                        {k.code && <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        {k.deadline && <span>Frist: {formatDateTime(k.deadline, dl)}</span>}
                        <span>Erstellt: {formatDateTime(k.time, dl)}</span>
                      </div>
                      {k.kommentar && <p className="text-xs text-gray-400 italic">{k.kommentar}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Prüfungen ── */}
        {(() => {
          const pruefungen = kontrollItems.filter(k => k.entryId !== null).sort((a, b) => b.time.getTime() - a.time.getTime());
          if (!pruefungen.length) return null;
          return (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><ClipboardList size={12} />{t("inspections")} ({pruefungen.length})</p>
              </div>
              <KontrolleItemListClient
                imageAlt={t("inspections")}
                items={pruefungen.map((k): KontrolleItemData => {
                  const kPill = getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta);
                  return {
                    id: k.id,
                    imageUrl: k.imageUrl,
                    kommentar: k.kommentar,
                    pill1Label: kPill?.label ?? null,
                    pill1Cls: kPill?.cls ?? null,
                    pill2Label: null,
                    pill2Cls: null,
                    code: k.code,
                    dateTimeStr: formatDateTime(k.time, dl),
                    dateTimePrefix: ta("fulfilledLabel"),
                    deadlineStr: k.deadline ? formatDateTime(k.deadline, dl) : null,
                    deadlinePrefix: ta("frist"),
                    note: k.note,
                    entryId: k.entryId,
                    editHref: k.entryId ? `/dashboard/edit/${k.entryId}` : null,
                  };
                })}
              />
            </div>
          );
        })()}

        {/* ── Orgasmus-Einträge ── */}
        {orgasmusEntries.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Droplets size={12} />{t("orgasms")}</p>
            </div>
            <OrgasmenListClient
              items={orgasmusEntries.map((e): OrgasmusItemData => ({
                id: e.id,
                dateTimeStr: formatDateTime(e.startTime, dl),
                orgasmusArt: e.orgasmusArt,
                note: e.note,
                editHref: `/dashboard/edit/${e.id}`,
              }))}
            />
          </div>
        )}

      </main>
    </>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${warn ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${warn ? "text-red-500" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
