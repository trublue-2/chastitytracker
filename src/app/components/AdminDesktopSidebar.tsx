"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ClipboardList, Settings, LogOut, Plus, ChevronRight } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import Spinner from "./Spinner";

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
  const t = useTranslations("adminNav");
  const tAdmin = useTranslations("admin");
  const pathname = usePathname();
  const router = useRouter();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [userList, setUserList] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const navItems = [
    { href: "/admin", icon: LayoutDashboard, label: t("overview"), exact: true },
    { href: "/admin/kontrollen", icon: ClipboardList, label: t("kontrollen"), exact: false },
    { href: "/admin/settings", icon: Settings, label: t("settings"), exact: false },
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
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={t("selectUser")}>
        <div className="divide-y divide-border-subtle">
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
      </Sheet>

      <aside className="hidden lg:flex fixed left-0 top-14 bottom-0 w-64 bg-nav-bg border-r border-nav-border flex-col z-20">
        <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4 overflow-y-auto">
          <button
            onClick={handleNeu}
            disabled={loading}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-nav-inactive-text hover:bg-surface-raised hover:text-nav-inactive-hover w-full text-left disabled:opacity-50 mb-1"
          >
            {loading ? <Spinner size="sm" /> : <Plus size={18} strokeWidth={1.75} />}
            {t("new")}
          </button>
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-nav-active-bg text-nav-active-text"
                    : "text-nav-inactive-text hover:bg-surface-raised hover:text-nav-inactive-hover",
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-nav-border flex-shrink-0 flex flex-col gap-3">
          <button
            onClick={() => { if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-nav-inactive-text hover:bg-surface-raised hover:text-nav-inactive-hover transition-colors w-full text-left"
          >
            <LogOut size={18} strokeWidth={1.5} />
            {t("signOut")}
          </button>
          <div className="px-2 flex flex-col gap-0.5">
            <Link href="/admin/changelog" className="text-xs text-foreground-faint hover:text-foreground-muted transition font-mono">
              v{version}
            </Link>
            <span className="text-[10px] text-foreground-faint">
              Build {buildDate}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
