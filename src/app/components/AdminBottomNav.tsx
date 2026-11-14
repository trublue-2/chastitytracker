"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { adminNavItems, ADMIN_HOME_HREF, type AdminNavItem } from "@/lib/adminNavItems";
import AdminFAB from "./AdminFAB";
import AppFooterMeta from "@/app/components/AppFooterMeta";

interface Props {
  version?: string;
  isGlobalAdmin: boolean;
  hideOwnTracker?: boolean;
}

export default function AdminBottomNav({ version, isGlobalAdmin, hideOwnTracker }: Props) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();

  // Split the shared nav around the center FAB: the area home (/admin) on the left, the rest on the
  // right. Keyed on the home href, not an index, so a reorder in adminNavItems() can't misplace a
  // tab. Same source as the desktop sidebar so the two never drift.
  const items = adminNavItems(isGlobalAdmin, hideOwnTracker);
  const leftTabs = items.filter((i) => i.href === ADMIN_HOME_HREF);
  const rightTabs = items.filter((i) => i.href !== ADMIN_HOME_HREF);

  const renderTab = (tab: AdminNavItem) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        /* `aria-current`, weil der aktive Reiter sonst NUR über Farbe und Strichstärke codiert ist:
           für einen Screenreader sind alle Einträge gleich, und wer Farben nicht unterscheidet,
           sieht ebenfalls keinen Unterschied (WCAG 1.3.1 und 1.4.1). */
        aria-current={active ? "page" : undefined}
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
    <nav aria-label={t("mainNavLabel")} className="lg:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16 items-center">
        {leftTabs.map(renderTab)}
        <AdminFAB isGlobalAdmin={isGlobalAdmin} />
        {rightTabs.map(renderTab)}
      </div>
      {/* h-6 wie in `BottomNav`: die Höhe der Leiste ist als `--bottom-nav-h` (globals.css)
          festgeschrieben, weil Platzhalter und schwebende Banner sie brauchen. Entsteht sie hier
          aus Schriftgrösse und Polsterung, driftet sie von dem Token weg, das sie beschreibt. */}
      {version && (
        <div className="flex items-center justify-between px-4 h-6">
          <AppFooterMeta version={version} />
        </div>
      )}
    </nav>
  );
}
