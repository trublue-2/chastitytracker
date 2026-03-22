import Header from "@/app/Header";
import Footer from "@/app/Footer";
import BottomNav from "@/app/components/BottomNav";
import DesktopSidebar from "@/app/components/DesktopSidebar";
import InstallBanner from "@/app/components/InstallBanner";
import { auth } from "@/lib/auth";
import pkg from "../../../package.json";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const buildDate = process.env.BUILD_DATE
    ? new Date(process.env.BUILD_DATE).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })
    : "local";

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <Header />
      <DesktopSidebar isAdmin={user?.role === "admin"} version={pkg.version} buildDate={buildDate} />

      {/* Mobile: username context bar — sticky below header */}
      {user && (
        <div className="sm:hidden sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {user.name?.[0].toUpperCase()}
          </span>
          <span className="text-sm font-semibold text-gray-700">{user.name}</span>
        </div>
      )}

      {/* Content */}
      <div className="sm:ml-52 flex flex-col min-h-[calc(100vh-3.5rem)] pb-16 sm:pb-0">
        {children}
      </div>

      <BottomNav isAdmin={user?.role === "admin"} buildDate={buildDate} />
      <InstallBanner />
    </div>
  );
}
