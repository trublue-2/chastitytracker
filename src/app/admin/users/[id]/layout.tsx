import { prisma } from "@/lib/prisma";
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

  // Parallelize all queries — select only needed fields for user-switcher
  const [user, allUsers, latestLockEntry, lastVerschluss, lastOeffnen] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true } }),
    prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } }),
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
      select: { type: true, startTime: true },
    }),
    prisma.entry.groupBy({ by: ["userId"], where: { type: "VERSCHLUSS" }, _max: { startTime: true } }),
    prisma.entry.groupBy({ by: ["userId"], where: { type: "OEFFNEN" }, _max: { startTime: true } }),
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
      />
      <UserSubNav userId={id} />
      {children}
    </>
  );
}
