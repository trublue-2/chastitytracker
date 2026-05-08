import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAccess } from "@/lib/serverLog";
import StatsMain from "@/app/components/StatsMain";
import WearStatsByCategory from "@/app/dashboard/stats/WearStatsByCategory";
import { deviceCategoriesEnabled } from "@/lib/constants";

export default async function AdminUserStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-muted">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/stats`);

  return (
    <>
      <StatsMain userId={id} />
      {deviceCategoriesEnabled() && (
        <div className="mt-4">
          <WearStatsByCategory userId={id} />
        </div>
      )}
    </>
  );
}
