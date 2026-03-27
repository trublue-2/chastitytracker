import { prisma } from "@/lib/prisma";
import UserContextBar from "./UserContextBar";

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

  // Get lock status for all users (for switch sheet)
  const userLockStatuses = await Promise.all(
    allUsers.map(async (u) => {
      const latest = await prisma.entry.findFirst({
        where: { userId: u.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
        orderBy: { startTime: "desc" },
        select: { type: true },
      });
      return { id: u.id, username: u.username, isLocked: latest?.type === "VERSCHLUSS" };
    })
  );

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
      {children}
    </>
  );
}
