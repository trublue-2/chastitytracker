"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
}

export default function UserSubNav({ userId }: Props) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/users/${userId}`;

  const tabs = [
    { href: base, label: t("overview_tab"), exact: true },
    { href: `${base}/aktionen`, label: t("actions_tab"), exact: false },
    { href: `${base}/eintraege`, label: t("entries_tab"), exact: false },
    { href: `${base}/kontrollen`, label: t("inspections_tab"), exact: false },
    { href: `${base}/einstellungen`, label: t("user_settings_tab"), exact: false },
    { href: `${base}/stats`, label: t("stats_tab"), exact: false },
    { href: `${base}/strafbuch`, label: t("strafbuch_tab"), exact: false },
  ];

  const active = tabs.find((tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  );

  return (
    <div className="sticky top-[108px] z-10 bg-surface border-b border-border-subtle">
      {/* Mobile: select dropdown */}
      <div className="lg:hidden px-4 py-2">
        <select
          value={active?.href ?? base}
          onChange={(e) => router.push(e.target.value)}
          className="w-full border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20"
        >
          {tabs.map((tab) => (
            <option key={tab.href} value={tab.href}>{tab.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop: tab bar */}
      <div className="hidden lg:flex px-4 lg:px-6">
        {tabs.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-foreground-faint hover:text-foreground-muted"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
