import { ShieldCheck, KeyRound, type LucideIcon } from "lucide-react";

export interface AdminNavEntry {
  href: string;
  icon: LucideIcon;
  label: string;
  exact: boolean;
}

/** The "admin access" entry for the user-facing nav (bottom nav + desktop sidebar).
 *  Admins get the full admin area (ShieldCheck); keyholders (non-admins) get the scoped
 *  /admin entry (KeyRound); everyone else gets nothing. Returns an array so callers can
 *  spread it into their tab list. Centralizing this keeps icon/href/precedence consistent
 *  across both navs (admin wins over keyholder). */
export function adminNavEntry(opts: {
  isAdmin?: boolean;
  isKeyholder?: boolean;
  adminLabel: string;
  keyholderLabel: string;
}): AdminNavEntry[] {
  if (opts.isAdmin) return [{ href: "/admin", icon: ShieldCheck, label: opts.adminLabel, exact: false }];
  if (opts.isKeyholder) return [{ href: "/admin", icon: KeyRound, label: opts.keyholderLabel, exact: false }];
  return [];
}
