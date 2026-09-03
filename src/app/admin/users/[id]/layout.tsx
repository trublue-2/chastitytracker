import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getLatestKgEntry, latestKgTimesByUser } from "@/lib/queries";
import { getControlledSubs } from "@/lib/keyholder";
import UserContextBar from "./UserContextBar";
import UserSubNav from "./UserSubNav";
import { blockStackCls, wideColCls } from "@/app/components/inputStyles";

export default async function AdminUserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Single guard for every per-user tab: global admin OR keyholder-of-id.
  const { userId: actorId, isGlobalAdmin } = await assertKeyholderOrAdmin(id);

  // Switch list: global admin sees all users; a keyholder sees only their controlled subs.
  const usersForSwitcher = isGlobalAdmin
    ? prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } })
    : getControlledSubs(actorId);

  // Parallelize all queries — select only needed fields for user-switcher
  const [user, allUsers, latestLockEntry] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true } }),
    usersForSwitcher,
    getLatestKgEntry(id),
  ]);

  const userIds = allUsers.map(u => u.id);
  const { lockedAt: vMap, openedAt: oMap } = await latestKgTimesByUser(userIds);

  if (!user) return <>{children}</>;

  // `isLocked: undefined` heisst „von diesem Träger liegt noch nichts vor" und ist NICHT dasselbe
  // wie `false`. Seit die Farbe beide Zustände trägt (grün verschlossen, rosa offen), leuchtete ein
  // frisch angelegtes Konto sonst rosa, als hätte jemand gerade aufgeschlossen.
  const userLockStatuses = allUsers.map((u) => {
    const vTime = vMap.get(u.id);
    const oTime = oMap.get(u.id);
    return {
      id: u.id,
      username: u.username,
      isLocked: !vTime && !oTime ? undefined : !!vTime && (!oTime || vTime > oTime),
    };
  });

  const currentStatus = latestLockEntry?.type === "VERSCHLUSS"
    ? "VERSCHLUSS" as const
    : latestLockEntry?.type === "OEFFNEN"
      ? "OEFFNEN" as const
      : null;

  return (
    <>
      <UserContextBar
        userId={id}
        username={user.username}
        currentStatus={currentStatus}
        since={latestLockEntry?.type === "VERSCHLUSS" ? latestLockEntry.startTime.toISOString() : null}
        users={userLockStatuses}
        isGlobalAdmin={isGlobalAdmin}
      />
      <UserSubNav userId={id} />
      {/* Kopfzeile und Reiter oben spannen die ganze HÜLLE (`adminShellColCls`, 1024) — sie rahmen
          die Seite und tragen die neun Reiter in einer Zeile. Der INHALT hier wird dagegen auf das
          Lesemass (`wideColCls`, 768) zurückgekappt: eine Detailzeile mit Name links und Chevron
          rechts zöge sich sonst auf Armlänge (der Grund, aus dem die Spalte einmal von 1024 auf 768
          zurückging). Die Blöcke füllen die gekappte Spalte, statt ihre eigene mitzubringen —
          Begründung in `DashboardBlock`. */}
      <main className={`flex-1 py-6 ${wideColCls} ${blockStackCls} [--block-col:100%] [--block-gutter:0px]`}>
        {children}
      </main>
    </>
  );
}
