import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import Link from "next/link";
import KontrolleActions from "./KontrolleActions";
import ImageViewer from "@/app/components/ImageViewer";
import { getTranslations, getLocale } from "next-intl/server";

function getStatus(ka: {
  entryId: string | null;
  withdrawnAt: Date | null;
  deadline: Date;
}, verifikationStatus: string | null): string {
  if (ka.withdrawnAt) return "withdrawn";
  if (!ka.entryId) return ka.deadline < new Date() ? "overdue" : "open";
  if (verifikationStatus === "rejected") return "rejected";
  if (verifikationStatus === "manual") return "manual";
  if (verifikationStatus === "ai") return "ai";
  return "fulfilled";
}

const statusStyle: Record<string, string> = {
  open:      "bg-amber-50 text-amber-700 border-amber-200",
  overdue:   "bg-red-50 text-red-700 border-red-200",
  fulfilled: "bg-gray-100 text-gray-500 border-gray-200",
  ai:        "bg-green-50 text-green-700 border-green-200",
  manual:    "bg-blue-50 text-blue-700 border-blue-200",
  rejected:  "bg-red-50 text-red-700 border-red-200",
  withdrawn: "bg-gray-100 text-gray-400 border-gray-200",
};

export default async function AdminKontrollenPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await auth();
  const { userId } = await searchParams;
  const t = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());

  const statusLabel: Record<string, string> = {
    open:      t("pillOpen"),
    overdue:   t("pillOverdue"),
    fulfilled: t("pillFulfilled"),
    ai:        t("pillAi"),
    manual:    t("pillManual"),
    rejected:  t("pillRejected"),
    withdrawn: t("pillWithdrawn"),
  };

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
    : null;

  const kontrollen = await prisma.kontrollAnforderung.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true } },
      entry: true,
    },
  });

  const rows = kontrollen.map((k) => ({
    ...k,
    status: getStatus(k, k.entry?.verifikationStatus ?? null),
  }));

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
            {rows.map((k) => (
              <div key={k.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {k.entry?.imageUrl && (
                  <ImageViewer src={k.entry.imageUrl} alt={t("kontrollenTitle")} width={64} height={64}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0" kommentar={k.kommentar} />
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!userId && (
                      <span className="font-semibold text-gray-900 text-sm">{k.user.username}</span>
                    )}
                    <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${statusStyle[k.status]}`}>
                      {statusLabel[k.status]}
                    </span>
                    <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                    <span>{t("frist")}: {formatDateTime(k.deadline, dl)}</span>
                    <span>{t("createdLabel")}: {formatDateTime(k.createdAt, dl)}</span>
                    {k.entry && <span>{t("fulfilledLabel")}: {formatDateTime(k.entry.startTime, dl)}</span>}
                    {k.withdrawnAt && <span>{t("withdrawnLabel")}: {formatDateTime(k.withdrawnAt, dl)}</span>}
                  </div>
                  {k.kommentar && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-0.5">
                      <span className="font-semibold">{t("instructionLabel")}:</span> {k.kommentar}
                    </p>
                  )}
                </div>
                <KontrolleActions id={k.id} status={k.status} verifikationStatus={k.entry?.verifikationStatus ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
