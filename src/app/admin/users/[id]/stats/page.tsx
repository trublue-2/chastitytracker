import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAccess } from "@/lib/serverLog";
import StatsMain from "@/app/components/StatsMain";
import UserNav from "../UserNav";

export default async function AdminUserStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-gray-500">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/stats`);

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="statistik" />
      <StatsMain userId={id} />
    </main>
  );
}
