import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getControlledSubs } from "@/lib/keyholder";
import Link from "next/link";

import KontrolleButton from "./KontrolleButton";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import WithdrawButton from "./WithdrawButton";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import Card from "@/app/components/Card";
import EmptyState from "@/app/components/EmptyState";
import UserAvatar from "@/app/components/UserAvatar";
import { Lock, LockOpen, Users, ShieldAlert, CalendarClock } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale, formatDuration, formatDateTimeDual, nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { getKeyholderSperrzeiten, getKeyholderOrgasmusAnforderungen, keyholderVisibleKontrolleWhere } from "@/lib/queries";
import { orgasmusAnforderungArtLabel } from "@/lib/constants";

export default async function AdminPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;
  const isGlobalAdmin = session?.user?.role === "admin";
  const t = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());
  // Betrachter-Zeitzone (Keyholder): Zeit-Widgets primär in dieser tz; weicht die Sub-tz ab, wird
  // die Sub-Lokalzeit als Zusatz gezeigt (siehe formatDateTimeDual / Banner-viewerTz-Props).
  const viewerTz = session?.user?.timezone ?? APP_TZ;
  const subLabel = t("subTimePrefix");

  // MULTI-SUB view: each row belongs to a different sub → carry each user's timezone so per-row
  // timestamps/banners render in THAT sub's zone (not the viewing keyholder's).
  const userSelect = { id: true, username: true, role: true, email: true, createdAt: true, timezone: true, hideOwnTracker: true };

  let users;
  if (isGlobalAdmin) {
    // Feature flag: when USE_ADMIN_RELATIONSHIPS=true, admins only see their assigned users.
    const useRelationships = process.env.USE_ADMIN_RELATIONSHIPS === "true";
    users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: userSelect });
    if (useRelationships && currentUserId) {
      const rels = await prisma.adminUserRelationship.findMany({ where: { adminId: currentUserId } });
      const assignedIds = new Set(rels.map(r => r.userId));
      users = users.filter(u => u.role === "admin" || assignedIds.has(u.id));
    }
  } else {
    // Keyholder: only render the subs they control.
    const subs = currentUserId ? await getControlledSubs(currentUserId) : [];
    if (subs.length === 0) redirect("/dashboard");
    users = await prisma.user.findMany({
      where: { id: { in: subs.map(s => s.id) } },
      orderBy: { createdAt: "asc" },
      select: userSelect,
    });
  }
  // „Eigene Karte ausblenden": der eingeloggte Admin/Keyholder entfernt seine eigene Karte aus der
  // Übersicht (relevant v.a. für globale Admins — Keyholder sehen ihre eigene ohnehin nicht).
  users = users.filter(u => !(u.id === currentUserId && u.hideOwnTracker));
  const userIds = users.map(u => u.id);
  const now = new Date();

  // Bulk-fetch all data in 5 queries instead of 5×N
  const [latestVerschluss, latestOeffnen, allKontrolle, allVerschlussAnf, allSperrzeiten, allOrgasmusAnf] = await Promise.all([
    prisma.entry.groupBy({ by: ["userId"], where: { type: "VERSCHLUSS", userId: { in: userIds } }, _max: { startTime: true } }),
    prisma.entry.groupBy({ by: ["userId"], where: { type: "OEFFNEN", userId: { in: userIds } }, _max: { startTime: true } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: { in: userIds }, entryId: null, withdrawnAt: null, ...keyholderVisibleKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.verschlussAnforderung.findMany({
      where: { userId: { in: userIds }, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    getKeyholderSperrzeiten(userIds),
    getKeyholderOrgasmusAnforderungen(userIds),
  ]);

  // Build lookup maps from groupBy results
  const verschlussMap = new Map(latestVerschluss.map(v => [v.userId, v._max.startTime]));
  const oeffnenMap = new Map(latestOeffnen.map(o => [o.userId, o._max.startTime]));

  // Bucket directives by userId once (O(M)) instead of re-scanning each full array per user (O(N×M)).
  const groupByUser = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.userId) ?? m.set(r.userId, []).get(r.userId)!).push(r);
    return m;
  };
  const kontrolleByUser = groupByUser(allKontrolle);
  const anforderungByUser = groupByUser(allVerschlussAnf);
  const sperrzeitByUser = groupByUser(allSperrzeiten);
  const orgasmusAnfByUser = groupByUser(allOrgasmusAnf);

  const isScheduled = (wirksamAb: Date | null) => !!wirksamAb && wirksamAb > now;

  function getUserStats(userId: string) {
    const lastV = verschlussMap.get(userId);
    const lastO = oeffnenMap.get(userId);
    const latestType = !lastV && !lastO ? null : (!lastO || (lastV && lastV > lastO)) ? "VERSCHLUSS" : "OEFFNEN";
    const latestTime = latestType === "VERSCHLUSS" ? lastV : lastO;

    // Keyholder-Sichten zeigen geplante (wirksamAb > now) Direktiven separat — sie sind kein aktiver
    // Alarm, aber sichtbar + stornierbar. Aktive Banner zeigen nur bereits ausgelöste Direktiven.
    const userKontrollen = kontrolleByUser.get(userId) ?? [];
    const userAnforderungen = anforderungByUser.get(userId) ?? [];
    const userSperrzeiten = sperrzeitByUser.get(userId) ?? [];
    // OrgasmusAnforderung hat kein wirksamAb (keine Terminierung) — die neueste offene reicht.
    const offeneOrgasmusAnforderung = orgasmusAnfByUser.get(userId)?.[0] ?? null;

    const offeneKontrolle = userKontrollen.find(k => !isScheduled(k.wirksamAb)) ?? null;
    const offeneVerschlussAnforderung = userAnforderungen.find(v => !isScheduled(v.wirksamAb)) ?? null;
    const activeSperrzeit = userSperrzeiten.find(s => !isScheduled(s.wirksamAb)) ?? null;

    const scheduled = [
      ...userKontrollen.filter(k => isScheduled(k.wirksamAb)).map(k => ({ id: k.id, kind: "inspection" as const, wirksamAb: k.wirksamAb!, message: k.kommentar })),
      ...userAnforderungen.filter(v => isScheduled(v.wirksamAb)).map(v => ({ id: v.id, kind: "lock_request" as const, wirksamAb: v.wirksamAb!, message: v.nachricht })),
      ...userSperrzeiten.filter(s => isScheduled(s.wirksamAb)).map(s => ({ id: s.id, kind: "lock_period" as const, wirksamAb: s.wirksamAb!, message: s.nachricht })),
    ].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());

    return {
      currentStatus: latestType,
      since: latestTime ?? null,
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
      offeneOrgasmusAnforderung: offeneOrgasmusAnforderung
        ? { id: offeneOrgasmusAnforderung.id, art: offeneOrgasmusAnforderung.art as "ANWEISUNG" | "GELEGENHEIT", endetAt: offeneOrgasmusAnforderung.endetAt, expired: offeneOrgasmusAnforderung.endetAt < now }
        : null,
      scheduled,
    };
  }

  const usersWithStats = users.map(u => ({ ...u, stats: getUserStats(u.id) }));

  const lockedCount = usersWithStats.filter(u => u.stats.currentStatus === "VERSCHLUSS").length;
  const alarmCount = usersWithStats.filter(u => u.stats.offeneKontrolle || u.stats.hasOffeneAnforderung).length;

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

      {/* ── Summary Header ── */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">{t("overviewTitle")}</h1>
          <p className="text-sm text-foreground-muted mt-1">{t("overviewDesc")}</p>
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

{/* ── User cards grid ── */}
      {users.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Users size={36} />}
            title={t("noUsers")}
            description={t("noUsersDesc")}
            action={isGlobalAdmin ? { label: t("title"), href: "/admin/users" } : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {usersWithStats.map((u) => {
            const rowTz = u.timezone; // this row's sub governs its own timestamps
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
                      <UserAvatar username={u.username} size="lg" locked={isLocked} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">{u.username}</p>
                          {hasAlarm && (
                            <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />
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
                        tz={rowTz}
                        viewerTz={viewerTz}
                        withdrawAction={<WithdrawButton id={u.stats.offeneKontrolle.id} apiPath="/api/admin/kontrollen" titleKey="withdrawKontrolleTitle" colorToken="inspect" />}
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
                        tz={rowTz}
                        viewerTz={viewerTz}
                        subTimePrefix={subLabel}
                        withdrawAction={<WithdrawButton id={u.stats.offeneAnforderung.id} apiPath="/api/admin/verschluss-anforderung" titleKey="withdrawLockTitle" colorToken="sperrzeit" />}
                      />
                    )}
                    {u.stats.activeSperrzeit && (
                      <LockRequestBanner
                        variant="compact"
                        colorScheme="sperrzeit"
                        label={u.stats.activeSperrzeit.endetAt ? t("lockedUntil") : t("lockedIndefinite")}
                        locale={dl}
                        tz={rowTz}
                        viewerTz={viewerTz}
                        subTimePrefix={subLabel}
                        endetAt={u.stats.activeSperrzeit.endetAt}
                        showRemaining={!!u.stats.activeSperrzeit.endetAt}
                        withdrawAction={<WithdrawButton id={u.stats.activeSperrzeit.id} apiPath="/api/admin/verschluss-anforderung" titleKey="withdrawLockTitle" colorToken="sperrzeit" />}
                      />
                    )}
                    {u.stats.offeneOrgasmusAnforderung && (
                      <LockRequestBanner
                        variant="compact"
                        colorScheme="orgasm"
                        label={
                          orgasmusAnforderungArtLabel(u.stats.offeneOrgasmusAnforderung.art, t)
                          + (u.stats.offeneOrgasmusAnforderung.expired ? ` · ${t("orgasmAnforderungExpired")}` : "")
                        }
                        overdue={u.stats.offeneOrgasmusAnforderung.expired}
                        endetAt={u.stats.offeneOrgasmusAnforderung.endetAt}
                        locale={dl}
                        tz={rowTz}
                        viewerTz={viewerTz}
                        subTimePrefix={subLabel}
                        withdrawAction={<WithdrawButton id={u.stats.offeneOrgasmusAnforderung.id} apiPath="/api/admin/orgasmus-anforderung" titleKey="withdrawOrgasmTitle" colorToken="orgasm" />}
                      />
                    )}

                    {/* Geplante (noch nicht ausgelöste) Direktiven — sichtbar + stornierbar, kein Alarm */}
                    {u.stats.scheduled.length > 0 && (
                      <div className="relative z-20 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 flex flex-col gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
                          <CalendarClock size={12} /> {t("scheduledTitle")}
                        </p>
                        {u.stats.scheduled.map((s) => {
                          const kindLabel = s.kind === "inspection"
                            ? t("scheduledInspection")
                            : s.kind === "lock_request" ? t("scheduledLockRequest") : t("scheduledLockPeriod");
                          const apiPath = s.kind === "inspection" ? "/api/admin/kontrollen" : "/api/admin/verschluss-anforderung";
                          const colorToken = s.kind === "inspection" ? "inspect" as const : "sperrzeit" as const;
                          return (
                            <div key={s.id} className="flex items-center gap-2 text-xs text-foreground-muted">
                              <span className="font-semibold text-foreground">{kindLabel}</span>
                              <span className="text-foreground-faint">{t("scheduledForPrefix")} {formatDateTimeDual(s.wirksamAb, dl, viewerTz, rowTz, subLabel)}</span>
                              {s.message && <span className="truncate opacity-80">· {s.message}</span>}
                              <span className="ml-auto flex-shrink-0">
                                <WithdrawButton id={s.id} apiPath={apiPath} titleKey="scheduledWithdrawTitle" colorToken={colorToken} />
                              </span>
                            </div>
                          );
                        })}
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
                        tz={rowTz}
                        minNow={nowDatetimeLocal(rowTz)}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
