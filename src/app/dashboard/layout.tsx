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

  // Minimal FAB state query
  const [latestLockEntry, offeneKontrolle] = userId ? await Promise.all([
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

  const fabState: FabState = offeneKontrolle
    ? "kontrolle"
    : latestLockEntry?.type === "VERSCHLUSS"
      ? "locked"
      : latestLockEntry?.type === "OEFFNEN"
        ? "unlocked"
        : "none";

  return (
    <div data-theme="user" className="min-h-screen bg-background text-foreground">
      <Header />
      <DesktopSidebar isAdmin={user?.role === "admin"} version={pkg.version} buildDate={buildDate} />

      {/* Content */}
      <div className="sm:ml-52 flex flex-col min-h-[calc(100vh-3.5rem)] pb-16 sm:pb-0">
        {children}
      </div>

      <UserBottomNav fabState={fabState} buildDate={buildDate} />
      <InstallBanner />
    </div>
  );
}
