import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  const hostname = process.env.NEXTAUTH_URL
    ? (() => { try { return new URL(process.env.NEXTAUTH_URL!).hostname; } catch { return null; } })()
    : null;

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-30 pt-safe">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="font-bold text-gray-900 hover:text-gray-700 transition text-lg tracking-tight flex items-baseline gap-2">
          KG-Tracker
          {hostname && (
            <span className="text-xs font-normal text-gray-400 tracking-normal">
              {hostname}
            </span>
          )}
        </Link>

        {/* Desktop: user badge (nav is in sidebar) */}
        {user && (
          <div className="hidden sm:flex items-center gap-1.5 bg-gray-100 rounded-xl px-2.5 py-1">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {user.name?.[0].toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-gray-700">{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
}
