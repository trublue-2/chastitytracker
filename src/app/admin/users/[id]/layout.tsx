import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getLatestKgEntry } from "@/lib/queries";
import { getControlledSubs } from "@/lib/keyholder";
import UserContextBar from "./UserContextBar";
import UserSubNav from "./UserSubNav";

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
  const [lastVerschluss, lastOeffnen] = await Promise.all([
    prisma.entry.groupBy({ by: ["userId"], where: { type: "VERSCHLUSS", userId: { in: userIds } }, _max: { startTime: true } }),
    prisma.entry.groupBy({ by: ["userId"], where: { type: "OEFFNEN", userId: { in: userIds } }, _max: { startTime: true } }),
  ]);

  if (!user) return <>{children}</>;

  const vMap = new Map(lastVerschluss.map((r) => [r.userId, r._max.startTime]));
  const oMap = new Map(lastOeffnen.map((r) => [r.userId, r._max.startTime]));
  const userLockStatuses = allUsers.map((u) => {
    const vTime = vMap.get(u.id);
    const oTime = oMap.get(u.id);
    return { id: u.id, username: u.username, isLocked: !!vTime && (!oTime || vTime > oTime) };
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
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        {children}
      </main>
    </>
  );
}
