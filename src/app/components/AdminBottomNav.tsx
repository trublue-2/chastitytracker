"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { adminNavItems, ADMIN_HOME_HREF, type AdminNavItem } from "@/lib/adminNavItems";
import AdminFAB from "./AdminFAB";
import UpdateAvailableIndicator from "@/app/components/UpdateAvailableIndicator";

interface Props {
  version?: string;
  isGlobalAdmin: boolean;
}

export default function AdminBottomNav({ version, isGlobalAdmin }: Props) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();

  // Split the shared nav around the center FAB: the area home (/admin) on the left, the rest on the
  // right. Keyed on the home href, not an index, so a reorder in adminNavItems() can't misplace a
  // tab. Same source as the desktop sidebar so the two never drift.
  const items = adminNavItems(isGlobalAdmin);
  const leftTabs = items.filter((i) => i.href === ADMIN_HOME_HREF);
  const rightTabs = items.filter((i) => i.href !== ADMIN_HOME_HREF);

  const renderTab = (tab: AdminNavItem) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full ${
          active ? "text-nav-active-text" : "text-nav-inactive-text hover:text-nav-inactive-hover"
        }`}
      >
        <Icon size={22} strokeWidth={active ? 2 : 1.5} />
        <span className="text-[10px] font-medium">{t(tab.labelKey)}</span>
      </Link>
    );
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16 items-center">
        {leftTabs.map(renderTab)}
        <AdminFAB isGlobalAdmin={isGlobalAdmin} />
        {rightTabs.map(renderTab)}
      </div>
      {version && (
        <div className="flex items-center justify-between px-4 pb-1">
          <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-[10px] text-foreground-faint hover:text-foreground-muted transition">
            &copy; trublue {new Date().getFullYear()}
          </a>
          <div className="flex items-center gap-2">
            <UpdateAvailableIndicator currentVersion={version} />
            <Link href="/dashboard/changelog" className="text-[10px] font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
              {version}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
