import Header from "@/app/Header";
import UserBottomNav, { type FabState } from "@/app/components/UserBottomNav";
import DesktopSidebar from "@/app/components/DesktopSidebar";
import InstallBanner from "@/app/components/InstallBanner";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import pkg from "../../../package.json";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const userId = user?.id;

  const buildDate = process.env.BUILD_DATE
    ? new Date(process.env.BUILD_DATE).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })
    : "local";

  const [latestLock, openKontrolle] = userId ? await Promise.all([
    prisma.entry.findFirst({
      where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
      select: { type: true },
    }),
    prisma.kontrollAnforderung.findFirst({
      where: { userId, entryId: null, withdrawnAt: null },
      select: { id: true },
    }),
  ]) : [null, null];

  const isLocked = latestLock?.type === "VERSCHLUSS";
  const fabState: FabState = openKontrolle
    ? "kontrolle"
    : isLocked
      ? "locked"
      : latestLock
        ? "unlocked"
        : "none";

  return (
    <div className="min-h-screen bg-background" data-theme="user">
      <Header />
      <DesktopSidebar isAdmin={user?.role === "admin"} version={pkg.version} buildDate={buildDate} />

      {/* Mobile: username context bar */}
      {user && (
        <div className="sm:hidden sticky top-14 z-20 bg-surface border-b border-border-subtle px-4 py-2 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center flex-shrink-0">
            {user.name?.[0].toUpperCase()}
          </span>
          <span className="text-sm font-semibold text-foreground-muted">{user.name}</span>
        </div>
      )}

      {/* Content */}
      <div className="sm:ml-60 min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-0">
        {children}
      </div>

      <UserBottomNav fabState={fabState} isLocked={isLocked} isAdmin={user?.role === "admin"} version={pkg.version} buildDate={buildDate} />
      <InstallBanner />
    </div>
  );
}
