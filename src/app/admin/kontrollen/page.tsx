import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale, mapAnforderungStatus, mapVerifikationStatus } from "@/lib/utils";
import Link from "next/link";
import KontrolleActions from "./KontrolleActions";
import ImageViewer from "@/app/components/ImageViewer";
import { getTranslations, getLocale } from "next-intl/server";
import { ANFORDERUNG_PILLS, getKombinierterPill } from "@/lib/kontrollePills";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";

export default async function AdminKontrollenPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await auth();
  const { userId } = await searchParams;
  const t = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
    : null;

  const [pruefungen, alleAnforderungen] = await Promise.all([
    prisma.entry.findMany({
      where: { type: "PRUEFUNG", ...(userId ? { userId } : {}) },
      orderBy: { startTime: "desc" },
      include: { user: { select: { username: true } } },
    }),
    prisma.kontrollAnforderung.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
  ]);

  const kaByEntryId = new Map(alleAnforderungen.filter(k => k.entryId).map(k => [k.entryId!, k]));

  type Row = {
    sortTime: Date;
    imageUrl: string | null;
    username: string;
    anforderungStatus: AnforderungStatus | null;
    verifikationStatus: VerifikationStatus | null;
    code: string | null;
    deadline: Date | null;
    createdAt: Date | null;
    fulfilledAt: Date | null;
    withdrawnAt: Date | null;
    kommentar: string | null;
    note: string | null;
    kontrolleId: string | null;
    entryId: string | null;
  };

  const pruefungRows: Row[] = pruefungen.map((e) => {
    const ka = kaByEntryId.get(e.id) ?? null;
    return {
      sortTime: e.startTime,
      imageUrl: e.imageUrl,
      username: e.user.username,
      anforderungStatus: ka ? mapAnforderungStatus(ka, e.startTime, now) : null,
      verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
      code: ka?.code ?? e.kontrollCode ?? null,
      deadline: ka?.deadline ?? null,
      createdAt: ka?.createdAt ?? null,
      fulfilledAt: e.startTime,
      withdrawnAt: ka?.withdrawnAt ?? null,
      kommentar: ka?.kommentar ?? null,
      note: e.note,
      kontrolleId: ka?.id ?? null,
      entryId: e.id,
    };
  });

  const offeneRows: Row[] = alleAnforderungen
    .filter((k) => !k.entryId)
    .map((k) => ({
      sortTime: k.createdAt,
      imageUrl: null,
      username: k.user.username,
      anforderungStatus: mapAnforderungStatus(k, null, now),
      verifikationStatus: null,
      code: k.code,
      deadline: k.deadline,
      createdAt: k.createdAt,
      fulfilledAt: null,
      withdrawnAt: k.withdrawnAt,
      kommentar: k.kommentar,
      note: null,
      kontrolleId: k.id,
      entryId: null,
    }));

  const rows = [...pruefungRows, ...offeneRows].sort(
    (a, b) => b.sortTime.getTime() - a.sortTime.getTime()
  );

  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        {user ? (
          <Link href={`/admin/users/${user.id}`} className="text-sm text-gray-400 hover:text-gray-600 transition">
            ← {user.username}
          </Link>
        ) : (
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">
            {t("backToUsers")}
          </Link>
        )}
        <h1 className="text-xl font-bold text-gray-900 mt-1">
          {t("kontrollenTitle")}{user ? ` – ${user.username}` : ""}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{t("kontrolleCount", { count: rows.length })}</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
          {t("noKontrollenYet")}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {rows.map((row, i) => {
              const kPill = row.entryId
                ? getKombinierterPill(row.anforderungStatus, row.verifikationStatus)
                : (row.anforderungStatus ? ANFORDERUNG_PILLS[row.anforderungStatus] : null);
              return (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  {row.imageUrl && (
                    <ImageViewer src={row.imageUrl} alt={t("kontrollenTitle")} width={40} height={40}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0" kommentar={row.kommentar} />
                  )}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!userId && (
                        <span className="font-semibold text-gray-900 text-sm">{row.username}</span>
                      )}
                      {kPill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${kPill.cls}`}>{kPill.label}</span>}
                      {row.code && <span className="font-mono font-bold text-orange-500 text-sm">{row.code}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      {row.fulfilledAt && <span>{t("fulfilledLabel")}: {formatDateTime(row.fulfilledAt, dl)}</span>}
                      {row.deadline && <span>{t("frist")}: {formatDateTime(row.deadline, dl)}</span>}
                      {row.createdAt && <span>{t("createdLabel")}: {formatDateTime(row.createdAt, dl)}</span>}
                      {row.withdrawnAt && <span>{t("withdrawnLabel")}: {formatDateTime(row.withdrawnAt, dl)}</span>}
                    </div>
                    {row.kommentar && (
                      <p className="text-xs text-gray-400 italic mt-0.5">{t("instructionLabel")}: {row.kommentar}</p>
                    )}
                    {row.note && (
                      <p className="text-xs text-gray-500 italic mt-0.5">„{row.note}"</p>
                    )}
                  </div>
                  {(row.kontrolleId || row.entryId) && (
                    <KontrolleActions
                      kontrolleId={row.kontrolleId}
                      entryId={row.entryId}
                      anforderungStatus={row.anforderungStatus ?? "open"}
                      verifikationStatus={row.verifikationStatus}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
