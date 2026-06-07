import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { logAccess } from "@/lib/serverLog";
import UserStatsView from "@/app/components/UserStatsView";

export default async function AdminUserStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-muted">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/stats`);

  return <UserStatsView userId={id} />;
}
