import { LayoutDashboard, ClipboardList, Home, type LucideIcon } from "lucide-react";

/** The admin area's home route. Single source so the mobile bottom-nav FAB split (see AdminBottomNav)
 *  can't drift from the item definition here. */
export const ADMIN_HOME_HREF = "/admin";

export interface AdminNavItem {
  href: string;
  icon: LucideIcon;
  /** Key within the "adminNav" i18n namespace. */
  labelKey: string;
  exact: boolean;
}

/** Ordered nav items for the admin area (blue). Kontrollen is admin-only; a pure keyholder sees only
 *  the control overview plus the link back to their own (green) view. Shared by the desktop sidebar
 *  and the mobile bottom nav so the two never drift. Benutzerverwaltung is deliberately NOT here —
 *  it's a rare instance-management task, and these four slots belong to the frequent control tasks.
 *  It lives as an icon button in `AdminHeader` (was the avatar menu until v6.2.4). Consequence of
 *  staying out of this list: it is absent from the desktop sidebar too, which is fed from here —
 *  the header carries it on both widths instead. */
export function adminNavItems(isGlobalAdmin: boolean, hideOwnTracker = false): AdminNavItem[] {
  return [
    { href: ADMIN_HOME_HREF, icon: LayoutDashboard, labelKey: "overview", exact: true },
    ...(isGlobalAdmin
      ? [{ href: "/admin/kontrollen", icon: ClipboardList, labelKey: "kontrollen", exact: false }]
      : []),
    // "Meine Sicht" (eigener grüner Tracker) entfällt für Nutzer mit "kein eigener Tracker".
    ...(hideOwnTracker ? [] : [{ href: "/dashboard", icon: Home, labelKey: "myView", exact: true }]),
  ];
}
