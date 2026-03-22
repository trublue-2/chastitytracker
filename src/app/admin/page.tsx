import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import DeleteUserButton from "./DeleteUserButton";
import RoleSelect from "./RoleSelect";
import CreateDemoUserButton from "./CreateDemoUserButton";
import KontrolleButton from "./KontrolleButton";
import { Lock, LockOpen } from "lucide-react";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import WithdrawVerschlussButton from "./WithdrawVerschlussButton";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale, APP_TZ } from "@/lib/utils";

async function getUserStats(userId: string) {
  const entries = await prisma.entry.findMany({
    where: { userId },
    orderBy: { startTime: "asc" },
  });

  const latest = [...entries]
    .filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;
  const currentStatus = latest?.type ?? null;
  const since = latest?.startTime ?? null;

  let totalPairs = 0;
  let pending: (typeof entries)[0] | null = null;
  for (const e of entries) {
    if (e.type === "VERSCHLUSS") {
      if (pending) totalPairs++;
      pending = e;
    } else if (e.type === "OEFFNEN" && pending) {
      totalPairs++;
      pending = null;
    }
  }
  if (pending) totalPairs++;

  const now = new Date();
  const offeneKontrolle = await prisma.kontrollAnforderung.findFirst({
    where: { userId, entryId: null, withdrawnAt: null },
    orderBy: { createdAt: "desc" },
  });

  const offeneVerschlussAnforderung = await prisma.verschlussAnforderung.findFirst({
    where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
  });
  const activeSperrzeit = await prisma.verschlussAnforderung.findFirst({
    where: { userId, art: "SPERRZEIT", withdrawnAt: null, endetAt: { gt: now } },
  });

  return {
    currentStatus,
    since,
    totalPairs,
    offeneKontrolle: offeneKontrolle
      ? { deadline: offeneKontrolle.deadline, code: offeneKontrolle.code, kommentar: offeneKontrolle.kommentar, overdue: offeneKontrolle.deadline < now }
      : null,
    hasOffeneAnforderung: !!offeneVerschlussAnforderung,
    hasActiveSperrzeit: !!activeSperrzeit,
    offeneAnforderung: offeneVerschlussAnforderung
      ? { id: offeneVerschlussAnforderung.id, nachricht: offeneVerschlussAnforderung.nachricht, endetAt: offeneVerschlussAnforderung.endetAt }
      : null,
    activeSperrzeit: activeSperrzeit
      ? { id: activeSperrzeit.id, nachricht: activeSperrzeit.nachricht, endetAt: activeSperrzeit.endetAt }
      : null,
  };
}

export default async function AdminPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const dl = toDateLocale(await getLocale());

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const demoExists = users.some((u) => u.username === "DemoUser");

  const usersWithStats = await Promise.all(
    users.map(async (u) => ({ ...u, stats: await getUserStats(u.id) }))
  );

  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-400 mt-1">{t("usersRegistered", { count: users.length })}</p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-indigo-500 active:scale-95 transition-all flex-shrink-0 whitespace-nowrap"
        >
          + {t("newUser")}
        </Link>
      </div>

      {!demoExists && (
        <div className="mb-6">
          <CreateDemoUserButton />
        </div>
      )}

        <div className="grid gap-4 sm:grid-cols-2">
          {usersWithStats.map((u) => {
            const isLocked = u.stats.currentStatus === "VERSCHLUSS";
            const sinceStr = u.stats.since
              ? new Date(u.stats.since).toLocaleString(dl, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: APP_TZ,
                })
              : null;

            return (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-gray-900">{u.username}</p>
                    <DeleteUserButton id={u.id} username={u.username} isSelf={u.id === currentUserId} />
                  </div>
                  <div><RoleSelect id={u.id} currentRole={u.role} /></div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-xs font-medium text-gray-400 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition"
                    >
                      {t("overview")}
                    </Link>
                    <Link
                      href={`/admin/users/${u.id}/stats`}
                      className="text-xs font-medium text-gray-400 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition"
                    >
                      {t("statsTitle")}
                    </Link>
                    <Link
                      href={`/admin/users/${u.id}/vorgaben`}
                      className="text-xs font-medium text-gray-400 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition"
                    >
                      {t("vorgaben")}
                    </Link>
                    <Link
                      href={`/admin/users/${u.id}/kontrollen`}
                      className="text-xs font-medium text-gray-400 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition"
                    >
                      {t("kontrollen")}
                    </Link>
                    {isLocked && (
                      <KontrolleButton userId={u.id} hasEmail={!!u.email} />
                    )}
                    <VerschlussAnforderungButton
                      userId={u.id}
                      hasEmail={!!u.email}
                      isLocked={isLocked}
                      hasOffeneAnforderung={u.stats.hasOffeneAnforderung}
                      hasActiveSperrzeit={u.stats.hasActiveSperrzeit}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400 mb-0.5">{tc("status")}</p>
                    <p className={`text-sm font-bold flex items-center gap-1 ${isLocked ? "text-emerald-600" : u.stats.currentStatus ? "text-gray-900" : "text-gray-400"}`}>
                      {isLocked ? <><Lock size={13} />{t("locked")}</> : u.stats.currentStatus ? <><LockOpen size={13} />{t("opened")}</> : "–"}
                    </p>
                    {sinceStr && (
                      <p className="text-xs text-gray-400 mt-0.5">{tc("since")} {sinceStr}</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400 mb-0.5">{t("entries")}</p>
                    <p className="text-2xl font-bold text-gray-900">{u.stats.totalPairs}</p>
                  </div>
                </div>

                {u.stats.offeneKontrolle && (
                  <KontrolleBanner
                    deadline={u.stats.offeneKontrolle.deadline}
                    code={u.stats.offeneKontrolle.code}
                    kommentar={u.stats.offeneKontrolle.kommentar}
                    overdue={u.stats.offeneKontrolle.overdue}
                    variant="compact"
                  />
                )}
                {u.stats.offeneAnforderung && (
                  <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Lock size={11} className="text-indigo-500 shrink-0" />
                      <span className="text-xs text-indigo-700 font-medium truncate">{t("lockRequested")}</span>
                      {u.stats.offeneAnforderung.endetAt && (
                        <span className="text-xs text-indigo-400 shrink-0">
                          {tc("to")} {new Date(u.stats.offeneAnforderung.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
                        </span>
                      )}
                    </div>
                    <WithdrawVerschlussButton id={u.stats.offeneAnforderung.id} />
                  </div>
                )}
                {u.stats.activeSperrzeit && (
                  <div className="flex items-center justify-between gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Lock size={11} className="text-rose-500 shrink-0" />
                      <span className="text-xs text-rose-700 font-medium">{t("lockedUntil")}</span>
                      {u.stats.activeSperrzeit.endetAt && (
                        <span className="text-xs text-rose-600 font-bold shrink-0">
                          {new Date(u.stats.activeSperrzeit.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
                        </span>
                      )}
                    </div>
                    <WithdrawVerschlussButton id={u.stats.activeSperrzeit.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {users.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
            {t("noUsers")}
          </div>
        )}
    </main>
  );
}
