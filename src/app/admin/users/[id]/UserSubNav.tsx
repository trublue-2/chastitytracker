"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
}

export default function UserSubNav({ userId }: Props) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/users/${userId}`;

  const tabs = [
    { href: base, label: t("overview"), exact: true },
    { href: `${base}/aktionen`, label: t("aktionen"), exact: false },
    { href: `${base}/eintraege`, label: "Einträge", exact: false },
    { href: `${base}/kontrollen`, label: t("kontrollen"), exact: false },
    { href: `${base}/einstellungen`, label: t("einstellungen"), exact: false },
    { href: `${base}/stats`, label: t("statsTitle"), exact: false },
  ];

  const active = tabs.find((tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  );

  return (
    <div className="sticky top-[108px] z-10 bg-surface border-b border-border-subtle">
      {/* Mobile: select dropdown */}
      <div className="sm:hidden px-4 py-2">
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
      <div className="hidden sm:flex px-4 sm:px-6">
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
