import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDuration, formatDateTime, formatHours, wearingHoursInRange, APP_TZ } from "@/lib/utils";
import { KONTROLLE_PILLS } from "@/lib/kontrollePills";
import EntryActions from "./EntryActions";
import PairRow from "./PairRow";
import StatusBanner from "./StatusBanner";
import LaufendeSessionCard from "./LaufendeSessionCard";
import SessionList from "./SessionList";
import { Lock, LockOpen, ClipboardList, Droplets } from "lucide-react";
import ImageViewer from "@/app/components/ImageViewer";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale } from "@/lib/utils";

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
  status: "open" | "overdue" | "fulfilled" | "ai" | "manual" | "rejected" | "withdrawn";
  entryId: string | null;
};

type Pair = {
  verschluss: Entry;
  oeffnen: Entry | null;
  active: boolean;
  kontrollen: KontrolleItem[];
};

function buildPairs(entries: Entry[], kontrollen: KontrolleItem[]): Pair[] {
  const asc = [...entries]
    .filter((e) => ["VERSCHLUSS", "OEFFNEN"].includes(e.type))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const pairs: Pair[] = [];
  let pending: Entry | null = null;

  for (const e of asc) {
    if (e.type === "VERSCHLUSS") {
      if (pending) pairs.push({ verschluss: pending, oeffnen: null, active: false, kontrollen: [] });
      pending = e;
    } else if (e.type === "OEFFNEN" && pending) {
      pairs.push({ verschluss: pending, oeffnen: e, active: false, kontrollen: [] });
      pending = null;
    }
  }
  if (pending) pairs.push({ verschluss: pending, oeffnen: null, active: true, kontrollen: [] });

  for (const k of kontrollen) {
    // Pick the most-recent (latest verschluss) pair that contains k.time
    const pair = pairs.reduce<Pair | null>((best, p) => {
      const start = p.verschluss.startTime.getTime();
      const end = p.oeffnen ? p.oeffnen.startTime.getTime() : Infinity;
      if (k.time.getTime() < start || k.time.getTime() > end) return best;
      if (!best) return p;
      return p.verschluss.startTime > best.verschluss.startTime ? p : best;
    }, null);
    if (pair) pair.kontrollen.push(k);
  }

  return pairs.reverse();
}

function photoStatus(v: Entry): "no-photo" | "exif-mismatch" | "ok" {
  if (!v.imageUrl) return "no-photo";
  if (v.imageExifTime && Math.abs(v.imageExifTime.getTime() - v.startTime.getTime()) > 3600000)
    return "exif-mismatch";
  return "ok";
}


export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [t, tCommon, ta] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getTranslations("admin"),
  ]);

  const PILL_LABEL_KEYS: Record<string, Parameters<typeof ta>[0]> = {
    open: "pillOpen", overdue: "pillOverdue", fulfilled: "pillFulfilled",
    ai: "pillAi", manual: "pillManual", rejected: "pillRejected", withdrawn: "pillWithdrawn",
  };
  const dl = toDateLocale(await getLocale());
  const now = new Date();
  const [entries, alleAnforderungen, activeVorgabe, offeneVerschlussAnf, activeSperrzeit] = await Promise.all([
    prisma.entry.findMany({ where: { userId }, orderBy: { startTime: "desc" } }),
    prisma.kontrollAnforderung.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { entry: true } }),
    prisma.trainingVorgabe.findFirst({
      where: { userId, gueltigAb: { lte: now }, OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }] },
      orderBy: { gueltigAb: "desc" },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null }, // VerschlussAnforderung still has fulfilledAt
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "SPERRZEIT", withdrawnAt: null, endetAt: { gt: now } },
    }),
  ]);

  const offeneKontrolle = alleAnforderungen.find(k => !k.entryId && !k.withdrawnAt) ?? null;

  // Build unified KontrolleItems
  const linkedEntryIds = new Set(alleAnforderungen.map(k => k.entryId).filter(Boolean));
  const pruefungEntries = entries.filter(e => e.type === "PRUEFUNG");

  const kontrollItems: KontrolleItem[] = [
    // KontrollAnforderungen (mit FK verknüpft)
    ...alleAnforderungen.map(k => {
      const vs = k.entry?.verifikationStatus ?? null;
      const status: KontrolleItem["status"] =
        k.withdrawnAt ? "withdrawn" :
        !k.entryId ? (k.deadline < new Date() ? "overdue" : "open") :
        vs === "rejected" ? "rejected" :
        vs === "manual" ? "manual" :
        vs === "ai" ? "ai" :
        "fulfilled";
      return {
        id: k.id,
        time: k.entry ? k.entry.startTime : k.createdAt,
        imageUrl: k.entry?.imageUrl ?? null,
        code: k.code,
        deadline: k.deadline,
        kommentar: k.kommentar ?? null,
        status,
        entryId: k.entry?.id ?? null,
      };
    }),
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
        status: (e.verifikationStatus === "ai" ? "ai" : "fulfilled") as KontrolleItem["status"],
        entryId: e.id,
      })),
  ];

  const latest = [...entries]
    .filter((e) => ["VERSCHLUSS", "OEFFNEN"].includes(e.type))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;

  const currentStatus = latest
    ? { type: latest.type as "VERSCHLUSS" | "OEFFNEN", since: latest.startTime.toISOString() }
    : null;

  const pairs = buildPairs(entries, kontrollItems);
  const verschluesse = entries.filter((e) => e.type === "VERSCHLUSS");
  const completedPairs = pairs.filter((p) => p.oeffnen);
  const totalMs = completedPairs.reduce(
    (s, p) => s + p.oeffnen!.startTime.getTime() - p.verschluss.startTime.getTime(), 0
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
          .filter((k) => k.status !== "withdrawn")
          .map((k) => ({
            type: "kontrolle" as const,
            time: k.time,
            imageUrl: k.imageUrl,
            imageExifTime: null,
            note: null,
            entryId: k.entryId,
            deadline: k.deadline,
            kontrolleKommentar: k.kommentar,
            kontrolleCode: k.code,
            kontrolleStatus: k.status,
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
      ].sort((a, b) => a.time.getTime() - b.time.getTime())
    : [];

  const nowMidnight = new Date(now);
  nowMidnight.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tagH = activePair ? wearingHoursInRange(entries, nowMidnight, now) : 0;
  const wocheH = activePair ? wearingHoursInRange(entries, weekStart, now) : 0;
  const monatH = activePair ? wearingHoursInRange(entries, monthStart, now) : 0;

  return (
    <>
      <main className="flex-1 w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>

        {/* ── Status / Laufende Session ── */}
        {activePair ? (
          <LaufendeSessionCard
            sessionStart={activePair.verschluss.startTime}
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
                {t("lockUntil", { date: new Date(offeneVerschlussAnf.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }) })}
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
                {t("openingForbiddenUntil", { date: new Date(activeSperrzeit.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }) })}
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
                  {new Date(activeVorgabe.gueltigAb).toLocaleDateString(dl, { timeZone: APP_TZ })} → {activeVorgabe.gueltigBis ? new Date(activeVorgabe.gueltigBis).toLocaleDateString(dl, { timeZone: APP_TZ }) : tCommon("open")}
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

        {/* ── Kontrollen ── */}
        {kontrollItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><ClipboardList size={12} />{t("inspections")}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {[...kontrollItems].sort((a, b) => b.time.getTime() - a.time.getTime()).map((k) => {
                const pill = KONTROLLE_PILLS[k.status];
                return (
                  <div key={k.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60 transition">
                    {k.imageUrl && (
                      <ImageViewer src={k.imageUrl} alt="Kontrolle" width={40} height={40}
                        className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      {pill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${pill.cls}`}>{ta(PILL_LABEL_KEYS[k.status] ?? "pillOpen")}</span>}
                      {k.code && <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>}
                      <span className="text-xs text-gray-400 truncate">{formatDateTime(k.time, dl)}</span>
                      {k.deadline && (
                        <span className="text-xs text-gray-300 truncate">{t("deadline")}: {formatDateTime(k.deadline, dl)}</span>
                      )}
                    </div>
                    {k.entryId && <EntryActions id={k.entryId} editHref={`/dashboard/edit/${k.entryId}`} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Orgasmus-Einträge ── */}
        {orgasmusEntries.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Droplets size={12} />{t("orgasms")}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {orgasmusEntries.map((e) => (
                <div key={e.id} className="px-5 py-3 hover:bg-gray-50/60 transition">
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{formatDateTime(e.startTime, dl)}</p>
                    <EntryActions id={e.id} editHref={`/dashboard/edit/${e.id}`} />
                  </div>
                  <p className="text-xs text-rose-500 font-medium mt-0.5">{e.orgasmusArt}</p>
                  {e.note && <p className="text-xs text-gray-400 italic mt-0.5">„{e.note}"</p>}
                </div>
              ))}
            </div>
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
