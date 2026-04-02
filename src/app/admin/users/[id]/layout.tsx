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

  const [user, allUsers] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.user.findMany({ orderBy: { username: "asc" } }),
  ]);

  if (!user) return <>{children}</>;

  // Get current lock status for context bar
  const latestLockEntry = await prisma.entry.findFirst({
    where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true, startTime: true },
  });

  // Get lock status for all users (for switch sheet) — two aggregate queries instead of one per user
  const userIds = allUsers.map((u) => u.id);
  const [lastVerschluss, lastOeffnen] = await Promise.all([
    prisma.entry.groupBy({ by: ["userId"], where: { userId: { in: userIds }, type: "VERSCHLUSS" }, _max: { startTime: true } }),
    prisma.entry.groupBy({ by: ["userId"], where: { userId: { in: userIds }, type: "OEFFNEN" }, _max: { startTime: true } }),
  ]);
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
