import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

import CreateDemoUserButton from "./CreateDemoUserButton";
import KontrolleButton from "./KontrolleButton";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import WithdrawVerschlussButton from "./WithdrawVerschlussButton";
import WithdrawKontrolleButton from "./WithdrawKontrolleButton";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
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
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">

      {/* ── Summary Header ── */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-sm text-foreground-muted">
              <Users size={14} strokeWidth={1.75} />
              <span className="font-semibold text-foreground">{users.length}</span>{" "}
              {t("usersRegistered", { count: users.length }).replace(/\d+\s*/, "")}
            </span>
            <span className={`flex items-center gap-1.5 text-sm ${lockedCount > 0 ? "text-lock" : "text-foreground-faint"}`}>
              <Lock size={14} strokeWidth={1.75} />
              <span className="font-semibold">{lockedCount}</span> {t("locked")}
            </span>
            {alarmCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-warn">
                <ShieldAlert size={14} strokeWidth={1.75} />
                <span className="font-semibold">{alarmCount}</span> {t("alarmeCount", { count: alarmCount }).replace(/\d+\s*/, "")}
              </span>
            )}
          </div>
        </div>
      </div>

      {!demoExists && (
        <div className="mb-5">
          <CreateDemoUserButton />
        </div>
      )}

      {/* ── User cards grid ── */}
      {users.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Users size={36} />}
            title={t("noUsers")}
            description={t("noUsersDesc")}
            action={{ label: t("newUser"), href: "/admin/users/new" }}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {usersWithStats.map((u) => {
            const isLocked = u.stats.currentStatus === "VERSCHLUSS";
            const sinceDisplay = u.stats.since
              ? formatDuration(u.stats.since, now, dl)
              : null;

            const hasAlarm = !!u.stats.offeneKontrolle || u.stats.hasOffeneAnforderung;

            return (
              <div key={u.id} className="relative">
                {/* Stretched link — covers whole card for navigation */}
                <Link
                  href={`/admin/users/${u.id}`}
                  className="absolute inset-0 z-10 rounded-2xl"
                  aria-label={u.username}
                />

                <Card padding="default">
                  <div className="flex flex-col gap-3">
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
                            <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />
                          )}
                          {u.role === "admin" && (
                            <Badge variant="inspect" label="Admin" size="sm" />
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 font-medium ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
                          {isLocked
                            ? `${t("locked")}${sinceDisplay ? ` · ${sinceDisplay}` : ""}`
                            : u.stats.currentStatus
                              ? `${t("opened")}${sinceDisplay ? ` · ${t("since")} ${sinceDisplay}` : ""}`
                              : t("noEntry")}
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
                    {u.stats.offeneAnforderung && (
                      <LockRequestBanner
                        variant="compact"
                        colorScheme="request"
                        label={u.stats.offeneAnforderung.overdue ? t("lockOverdue") : t("lockRequested")}
                        overdue={u.stats.offeneAnforderung.overdue}
                        endetAt={u.stats.offeneAnforderung.endetAt}
                        locale={dl}
                        withdrawAction={<WithdrawVerschlussButton id={u.stats.offeneAnforderung.id} />}
                      />
                    )}
                    {u.stats.activeSperrzeit && (
                      <LockRequestBanner
                        variant="compact"
                        colorScheme="sperrzeit"
                        label={u.stats.activeSperrzeit.endetAt
                          ? `${t("lockedUntil")} ${new Date(u.stats.activeSperrzeit.endetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}`
                          : t("lockedIndefinite")}
                        locale={dl}
                        withdrawAction={<WithdrawVerschlussButton id={u.stats.activeSperrzeit.id} />}
                      />
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
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <Link href="/admin/users/new">
          <Button variant="secondary" icon={<UserPlus size={15} strokeWidth={2} />} fullWidth>
            {t("newUser")}
          </Button>
        </Link>
      </div>
    </main>
  );
}
