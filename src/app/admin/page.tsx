import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import DeleteUserButton from "./DeleteUserButton";
import CreateDemoUserButton from "./CreateDemoUserButton";
import KontrolleButton from "./KontrolleButton";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import WithdrawVerschlussButton from "./WithdrawVerschlussButton";
import WithdrawKontrolleButton from "./WithdrawKontrolleButton";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import { Lock, LockOpen, UserPlus, Users, ShieldAlert } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale, formatDuration, APP_TZ } from "@/lib/utils";

export default async function AdminPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;
  const t = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());

  // Feature flag: when USE_ADMIN_RELATIONSHIPS=true, admins only see their assigned users.
  const useRelationships = process.env.USE_ADMIN_RELATIONSHIPS === "true";
  let users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  if (useRelationships && currentUserId) {
    const rels = await prisma.adminUserRelationship.findMany({ where: { adminId: currentUserId } });
    const assignedIds = new Set(rels.map(r => r.userId));
    users = users.filter(u => u.role === "admin" || assignedIds.has(u.id));
  }
  const demoExists = users.some((u) => u.username === "DemoUser");

  const userIds = users.map(u => u.id);
  const now = new Date();

  // Bulk-fetch all data in 4 queries instead of 4×N
  const [allEntries, allKontrolle, allVerschlussAnf, allSperrzeiten] = await Promise.all([
    prisma.entry.findMany({ where: { userId: { in: userIds } }, orderBy: { startTime: "asc" } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: { in: userIds }, entryId: null, withdrawnAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.verschlussAnforderung.findMany({
      where: { userId: { in: userIds }, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    prisma.verschlussAnforderung.findMany({
      where: { userId: { in: userIds }, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
    }),
  ]);

  function getUserStats(userId: string) {
    const entries = allEntries.filter(e => e.userId === userId);
    const latest = [...entries]
      .filter(e => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;

    const offeneKontrolle = allKontrolle.find(k => k.userId === userId) ?? null;
    const offeneVerschlussAnforderung = allVerschlussAnf.find(v => v.userId === userId) ?? null;
    const activeSperrzeit = allSperrzeiten.find(s => s.userId === userId) ?? null;

    return {
      currentStatus: latest?.type ?? null,
      since: latest?.startTime ?? null,
      offeneKontrolle: offeneKontrolle
        ? { id: offeneKontrolle.id, deadline: offeneKontrolle.deadline, code: offeneKontrolle.code, kommentar: offeneKontrolle.kommentar, overdue: offeneKontrolle.deadline < now }
        : null,
      hasOffeneAnforderung: !!offeneVerschlussAnforderung,
      hasActiveSperrzeit: !!activeSperrzeit,
      offeneAnforderung: offeneVerschlussAnforderung
        ? { id: offeneVerschlussAnforderung.id, nachricht: offeneVerschlussAnforderung.nachricht, endetAt: offeneVerschlussAnforderung.endetAt, overdue: !!offeneVerschlussAnforderung.endetAt && offeneVerschlussAnforderung.endetAt < now }
        : null,
      activeSperrzeit: activeSperrzeit
        ? { id: activeSperrzeit.id, nachricht: activeSperrzeit.nachricht, endetAt: activeSperrzeit.endetAt }
        : null,
    };
  }

  const usersWithStats = users.map(u => ({ ...u, stats: getUserStats(u.id) }));

  const lockedCount = usersWithStats.filter(u => u.stats.currentStatus === "VERSCHLUSS").length;
  const alarmCount = usersWithStats.filter(u => u.stats.offeneKontrolle || u.stats.hasOffeneAnforderung).length;

  return (
    <main className="flex-1 w-full max-w-5xl px-4 sm:px-6 py-6">

      {/* ── Summary Header ── */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-sm text-foreground-muted">
              <Users size={14} strokeWidth={1.75} />
              <span className="font-semibold text-foreground">{users.length}</span> {t("usersRegistered", { count: users.length }).replace(/\d+\s*/, "")}
            </span>
            <span className={`flex items-center gap-1.5 text-sm ${lockedCount > 0 ? "text-lock" : "text-foreground-faint"}`}>
              <Lock size={14} strokeWidth={1.75} />
              <span className="font-semibold">{lockedCount}</span> {t("locked")}
            </span>
            {alarmCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-warn">
                <ShieldAlert size={14} strokeWidth={1.75} />
                <span className="font-semibold">{alarmCount}</span> Alarm{alarmCount !== 1 ? "e" : ""}
              </span>
            )}
          </div>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-1.5 bg-btn-primary text-btn-primary-text text-sm font-semibold px-3 py-2 rounded-xl hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
        >
          <UserPlus size={15} strokeWidth={2} />
          {t("newUser")}
        </Link>
      </div>

      {!demoExists && (
        <div className="mb-5">
          <CreateDemoUserButton />
        </div>
      )}

      {/* ── User cards grid ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {usersWithStats.map((u) => {
          const isLocked = u.stats.currentStatus === "VERSCHLUSS";
          const sinceDisplay = u.stats.since
            ? formatDuration(u.stats.since, now, dl)
            : null;

          const hasAlarm = !!u.stats.offeneKontrolle || u.stats.hasOffeneAnforderung;

          return (
            <div key={u.id} className="relative bg-surface rounded-2xl border border-border hover:border-border-strong transition-colors overflow-hidden">
              {/* Stretched link — covers whole card for navigation */}
              <Link
                href={`/admin/users/${u.id}`}
                className="absolute inset-0 z-10"
                aria-label={`${u.username} öffnen`}
              />

              <div className="relative p-5 flex flex-col gap-3">
                {/* Header: avatar + name + status icon */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isLocked ? "bg-lock-bg text-lock" : "bg-surface-raised text-foreground-muted"
                  }`}>
                    {u.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">{u.username}</p>
                      {hasAlarm && (
                        <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" title="Alarm" />
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 font-medium ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
                      {isLocked
                        ? `VERSCHLOSSEN${sinceDisplay ? ` · ${sinceDisplay}` : ""}`
                        : u.stats.currentStatus
                          ? `OFFEN${sinceDisplay ? ` · seit ${sinceDisplay}` : ""}`
                          : "Kein Eintrag"}
                    </p>
                  </div>
                  <div className={`flex-shrink-0 mt-1 ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
                    {isLocked
                      ? <Lock size={18} strokeWidth={1.75} />
                      : <LockOpen size={18} strokeWidth={1.75} />
                    }
                  </div>
                </div>

                {/* Alarm banners */}
                {u.stats.offeneKontrolle && (
                  <KontrolleBanner
                    deadline={u.stats.offeneKontrolle.deadline}
                    code={u.stats.offeneKontrolle.code}
                    kommentar={u.stats.offeneKontrolle.kommentar}
                    overdue={u.stats.offeneKontrolle.overdue}
                    variant="compact"
                    withdrawAction={<WithdrawKontrolleButton id={u.stats.offeneKontrolle.id} />}
                  />
                )}
                {u.stats.offeneAnforderung && (() => {
                  const overdue = u.stats.offeneAnforderung.overdue;
                  return (
                    <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${overdue ? "bg-warn-bg border border-warn-border" : "bg-request-bg border border-request-border"}`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Lock size={11} className={`flex-shrink-0 ${overdue ? "text-warn" : "text-request"}`} />
                        <span className={`text-xs font-medium truncate ${overdue ? "text-warn-text" : "text-request-text"}`}>
                          {overdue ? t("lockOverdue") : t("lockRequested")}
                        </span>
                        {u.stats.offeneAnforderung.endetAt && (
                          <span className={`text-xs opacity-70 flex-shrink-0 ${overdue ? "text-warn" : "text-request"}`}>
                            bis {new Date(u.stats.offeneAnforderung.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
                          </span>
                        )}
                      </div>
                      <div className="relative z-20">
                        <WithdrawVerschlussButton id={u.stats.offeneAnforderung.id} />
                      </div>
                    </div>
                  );
                })()}
                {u.stats.activeSperrzeit && (
                  <div className="flex items-center justify-between gap-2 bg-sperrzeit-bg border border-sperrzeit-border rounded-xl px-3 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Lock size={11} className="text-sperrzeit flex-shrink-0" />
                      {u.stats.activeSperrzeit.endetAt ? (
                        <span className="text-xs text-sperrzeit-text font-medium">
                          {t("lockedUntil")}{" "}
                          <span className="font-bold">
                            {new Date(u.stats.activeSperrzeit.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-sperrzeit-text font-medium">{t("lockedIndefinite")}</span>
                      )}
                    </div>
                    <div className="relative z-20">
                      <WithdrawVerschlussButton id={u.stats.activeSperrzeit.id} />
                    </div>
                  </div>
                )}

                {/* Quick actions — z-20 so they're above the stretched link */}
                <div className="relative z-20 flex gap-2 flex-wrap">
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
                  {u.id !== currentUserId && (
                    <DeleteUserButton id={u.id} username={u.username} isSelf={false} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {users.length === 0 && (
        <div className="bg-surface rounded-2xl border border-border py-20 text-center">
          <p className="text-foreground-faint text-sm">Noch keine Benutzer.</p>
          <p className="text-foreground-faint text-xs mt-1">Lege den ersten Benutzer an, um mit der Betreuung zu beginnen.</p>
        </div>
      )}
    </main>
  );
}
