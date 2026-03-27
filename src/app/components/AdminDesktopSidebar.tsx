"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, Settings, LogOut, Plus, X, ChevronRight, Loader2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import pkg from "../../../package.json";

interface UserListItem {
  id: string;
  username: string;
  isLocked: boolean;
}

interface Props {
  version: string;
  buildDate: string;
}

export default function AdminDesktopSidebar({ version, buildDate }: Props) {
  const tAdmin = useTranslations("admin");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [userList, setUserList] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const navItems = [
    { href: "/admin", icon: Users, label: tAdmin("users"), exact: true },
    { href: "/admin/settings", icon: Settings, label: tNav("settings"), exact: false },
  ];

  const userIdFromPath = pathname.match(/^\/admin\/users\/([^/]+)/)?.[1] ?? null;

  const handleNeu = useCallback(async () => {
    if (userIdFromPath) {
      router.push(`/admin/users/${userIdFromPath}/aktionen`);
      return;
    }
    setLoading(true);
    if (!userList) {
      const res = await fetch("/api/admin/users");
      const list = res.ok ? await res.json() : [];
      setUserList(list);
    }
    setLoading(false);
    setPickerOpen(true);
  }, [userIdFromPath, userList, router]);

  return (
    <>
      {/* User picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPickerOpen(false)} />
          <div className="relative w-80 bg-surface rounded-2xl border border-border shadow-overlay p-4 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">{tAdmin("selectUser")}</span>
              <button onClick={() => setPickerOpen(false)} className="text-foreground-faint hover:text-foreground-muted transition">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-border-subtle">
              {userList?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setPickerOpen(false); router.push(`/admin/users/${u.id}/aktionen`); }}
                  className="w-full flex items-center justify-between px-2 py-3 hover:bg-surface-raised transition rounded-xl text-left"
                >
                  <span className="text-sm font-medium text-foreground">{u.username}</span>
                  <div className="flex items-center gap-2">
                    {u.isLocked && <span className="text-xs text-lock font-medium">{tAdmin("locked")}</span>}
                    <ChevronRight size={14} className="text-foreground-faint" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <aside className="hidden sm:flex fixed left-0 top-14 bottom-0 w-60 bg-surface border-r border-border flex-col z-20">
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={handleNeu}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
            {tNav("new")}
          </button>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-nav-active-bg text-nav-active-text border-l-2 border-[var(--color-request)]"
                    : "text-nav-inactive-text hover:bg-surface-raised hover:text-foreground-muted"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border flex-shrink-0 flex flex-col gap-3">
          <button
            onClick={() => { if (window.confirm(tNav("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-nav-inactive-text hover:bg-surface-raised hover:text-foreground-muted transition-colors w-full text-left"
          >
            <LogOut size={18} strokeWidth={1.75} />
            {tNav("signOut")}
          </button>
          <div className="px-2 flex flex-col gap-0.5">
            <span className="text-xs text-foreground-faint">
              <Link href="/dashboard/changelog" className="font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
                v{version}
              </Link>
              <span className="ml-2">Build {buildDate}</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
