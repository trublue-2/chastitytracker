import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDuration, formatDateTime, formatHours, toDateLocale } from "@/lib/utils";
import { KONTROLLE_PILLS } from "@/lib/kontrollePills";
import ChangePasswordButton from "@/app/admin/ChangePasswordButton";
import ChangeEmailButton from "@/app/admin/ChangeEmailButton";
import PairRow from "@/app/dashboard/PairRow";
import StatusBanner from "@/app/dashboard/StatusBanner";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import ImageViewer from "@/app/components/ImageViewer";
import EntryActions from "@/app/dashboard/EntryActions";
import { Lock, LockOpen, ClipboardList, Droplets } from "lucide-react";
import UserNav from "./UserNav";
import { getTranslations, getLocale } from "next-intl/server";

type Entry = {
  id: string;
  type: string;
  startTime: Date;
  imageUrl: string | null;
  imageExifTime: Date | null;
  note: string | null;
  orgasmusArt: string | null;
  aiVerified: boolean | null;
  kontrollCode: string | null;
  oeffnenGrund: string | null;
};

type KontrolleItem = {
  id: string;
  time: Date;
  imageUrl: string | null;
  code: string | null;
  deadline: Date | null;
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
    const pair = pairs.find((p) => {
      const start = p.verschluss.startTime.getTime();
      const end = p.oeffnen ? p.oeffnen.startTime.getTime() : Infinity;
      return k.time.getTime() >= start && k.time.getTime() <= end;
    });
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

export default async function AdminUserOverview({ params }: { params: Promise<{ id: string }> }) {
  await auth();
  const { id } = await params;
  const t = await getTranslations("admin");
  const ts = await getTranslations("stats");
  const td = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const dl = toDateLocale(await getLocale());

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-gray-500">{t("userNotFound")}</div>;

  const now = new Date();
  const [entries, alleAnforderungen, activeVorgabe] = await Promise.all([
    prisma.entry.findMany({ where: { userId: id }, orderBy: { startTime: "desc" } }),
    prisma.kontrollAnforderung.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } }),
    prisma.trainingVorgabe.findFirst({
      where: { userId: id, gueltigAb: { lte: now }, OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }] },
      orderBy: { gueltigAb: "desc" },
    }),
  ]);

  const offeneKontrolle = alleAnforderungen.find(k => !k.fulfilledAt && !k.withdrawnAt) ?? null;

  const anforderungCodes = new Set(alleAnforderungen.map(k => k.code).filter(Boolean));
  const pruefungEntries = entries.filter(e => e.type === "PRUEFUNG");
  const pruefungByCode = new Map(
    pruefungEntries.filter(e => e.kontrollCode && anforderungCodes.has(e.kontrollCode))
      .map(e => [e.kontrollCode!, e])
  );
  const usedEntryIds = new Set(Array.from(pruefungByCode.values()).map(e => e.id));

  const kontrollItems: KontrolleItem[] = [
    ...alleAnforderungen.map(k => {
      const pEntry = pruefungByCode.get(k.code ?? "");
      const aiVerified = pEntry?.aiVerified ?? null;
      const status: KontrolleItem["status"] =
        k.rejectedAt ? "rejected" :
        k.manuallyVerifiedAt ? "manual" :
        aiVerified === true ? "ai" :
        k.fulfilledAt ? "fulfilled" :
        k.withdrawnAt ? "withdrawn" :
        k.deadline < now ? "overdue" : "open";
      return {
        id: k.id,
        time: pEntry ? pEntry.startTime : k.createdAt,
        imageUrl: pEntry?.imageUrl ?? null,
        code: k.code,
        deadline: k.deadline,
        status,
        entryId: pEntry?.id ?? null,
      };
    }),
    ...pruefungEntries
      .filter(e => !usedEntryIds.has(e.id))
      .map(e => ({
        id: e.id,
        time: e.startTime,
        imageUrl: e.imageUrl,
        code: e.kontrollCode,
        deadline: null as Date | null,
        status: (e.aiVerified === true ? "ai" : "fulfilled") as KontrolleItem["status"],
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
  const completedPairs = pairs.filter((p) => p.oeffnen);
  const totalMs = completedPairs.reduce(
    (s, p) => s + p.oeffnen!.startTime.getTime() - p.verschluss.startTime.getTime(), 0
  );
  const totalFormatted = completedPairs.length ? formatDuration(new Date(0), new Date(totalMs), dl) : "–";
  const orgasmusEntries = entries
    .filter((e) => e.type === "ORGASMUS")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  const lastOrgasmus = orgasmusEntries[0] ?? null;
  const orgasmusFreiMs = lastOrgasmus ? now.getTime() - lastOrgasmus.startTime.getTime() : null;
  const orgasmusFreiDisplay = (() => {
    if (!orgasmusFreiMs) return null;
    const totalMinutes = Math.floor(orgasmusFreiMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    return days > 0 ? `${days}T ${hours}h` : `${hours}h`;
  })();

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="uebersicht" />

      {/* ── Profil / Email / Passwort ── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{user.username}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${user.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
              {user.role}
            </span>
            {user.email
              ? <p className="text-xs text-gray-400 mt-1">{user.email}</p>
              : <p className="text-xs text-amber-500 mt-1">{t("noEmail")}</p>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChangeEmailButton userId={user.id} currentEmail={user.email ?? null} />
          <ChangePasswordButton userId={user.id} />
        </div>
      </div>

      {/* ── Status Banner ── */}
      <StatusBanner type={currentStatus?.type ?? null} since={currentStatus?.since ?? null} />

      {/* ── Kontrolle Banner ── */}
      {offeneKontrolle && (
        <KontrolleBanner
          deadline={offeneKontrolle.deadline}
          code={offeneKontrolle.code}
          kommentar={offeneKontrolle.kommentar}
          overdue={offeneKontrolle.deadline < now}
          variant="large"
        />
      )}

      {/* ── Orgasmusfreie Zeit ── */}
      {orgasmusFreiDisplay !== null ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-500 mb-1">{ts("orgasmFreeTime")}</p>
          <p className="text-3xl font-bold text-rose-700 tracking-tight">{orgasmusFreiDisplay}</p>
          <p className="text-xs text-rose-400 mt-1">{ts("lastOrgasm")}: {formatDateTime(lastOrgasmus!.startTime, dl)}</p>
        </div>
      ) : (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-1">{ts("orgasmFreeTime")}</p>
          <p className="text-2xl font-bold text-rose-300">{ts("noEntry")}</p>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{ts("entries")}</p>
          <p className="text-2xl font-bold tracking-tight text-gray-900">{pairs.length}</p>
        </div>
        <div className="rounded-2xl border bg-white border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{ts("totalDuration")}</p>
          <p className="text-2xl font-bold tracking-tight text-gray-900">{totalFormatted}</p>
        </div>
      </div>

      {/* ── Trainingsvorgabe ── */}
      {activeVorgabe && (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{ts("trainingGoals")}</p>
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0">{t("vorgabeActive")}</span>
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {new Date(activeVorgabe.gueltigAb).toLocaleDateString(dl)} → {activeVorgabe.gueltigBis ? new Date(activeVorgabe.gueltigBis).toLocaleDateString(dl) : tc("open")}
              </p>
              <div className="flex flex-wrap gap-3 mt-1">
                {activeVorgabe.minProTagH != null && <span className="text-xs text-gray-600">{td("day")}: <strong>{formatHours(activeVorgabe.minProTagH, dl)}</strong> <span className="text-gray-400">({Math.round((activeVorgabe.minProTagH / 24) * 100)}%)</span></span>}
                {activeVorgabe.minProWocheH != null && <span className="text-xs text-gray-600">{td("week")}: <strong>{formatHours(activeVorgabe.minProWocheH, dl)}</strong> <span className="text-gray-400">({Math.round((activeVorgabe.minProWocheH / 168) * 100)}%)</span></span>}
                {activeVorgabe.minProMonatH != null && <span className="text-xs text-gray-600">{td("month")}: <strong>{formatHours(activeVorgabe.minProMonatH, dl)}</strong> <span className="text-gray-400">({Math.round((activeVorgabe.minProMonatH / 730) * 100)}%)</span></span>}
              </div>
              {activeVorgabe.notiz && <p className="text-xs text-gray-400 italic mt-0.5">{activeVorgabe.notiz}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Einschluss-Liste ── */}
      {pairs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
          {t("noEntries")}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-[80px_1fr_1fr] sm:grid-cols-[96px_1fr_1fr_auto] border-b border-gray-100 px-5 py-3 gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{td("photo")}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Lock size={11} />{td("lock")}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><LockOpen size={11} />{td("opening")}</span>
            <span className="hidden sm:block text-xs font-semibold uppercase tracking-wider text-gray-400">{tc("duration")}</span>
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
                    aiVerified: verschluss.aiVerified,
                    oeffnenGrund: verschluss.oeffnenGrund,
                  }}
                  oeffnen={oeffnen ? {
                    id: oeffnen.id,
                    startTime: oeffnen.startTime.toISOString(),
                    imageUrl: oeffnen.imageUrl,
                    imageExifTime: oeffnen.imageExifTime?.toISOString() ?? null,
                    note: oeffnen.note,
                    kontrollCode: oeffnen.kontrollCode,
                    aiVerified: oeffnen.aiVerified,
                    oeffnenGrund: oeffnen.oeffnenGrund,
                  } : null}
                  active={active}
                  duration={duration}
                  photoStatus={ps}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" /> {ts("noPhoto")}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" /> {td("exifDeviation")}</span>
          </div>
        </div>
      )}

      {/* ── Kontrollen ── */}
      {kontrollItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><ClipboardList size={12} />{ts("inspections")}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[...kontrollItems].sort((a, b) => b.time.getTime() - a.time.getTime()).map((k) => {
              const pill = KONTROLLE_PILLS[k.status];
              const pillLabels: Record<string, string> = {
                open: t("pillOpen"), overdue: t("pillOverdue"), fulfilled: t("pillFulfilled"),
                ai: t("pillAi"), manual: t("pillManual"), rejected: t("pillRejected"), withdrawn: t("pillWithdrawn"),
              };
              return (
                <div key={k.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60 transition">
                  {k.imageUrl && (
                    <ImageViewer src={k.imageUrl} alt={ts("inspections")} width={40} height={40}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    {pill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${pill.cls}`}>{pillLabels[k.status] ?? pill.label}</span>}
                    {k.code && <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>}
                    <span className="text-xs text-gray-400 truncate">{formatDateTime(k.time, dl)}</span>
                    {k.deadline && (
                      <span className="text-xs text-gray-300 truncate">{t("frist")}: {formatDateTime(k.deadline, dl)}</span>
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
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Droplets size={12} />{td("orgasms")}</p>
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
  );
}
