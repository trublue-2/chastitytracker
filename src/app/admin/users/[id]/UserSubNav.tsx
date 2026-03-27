"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
}

export default function UserSubNav({ userId }: Props) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const base = `/admin/users/${userId}`;

  const tabs = [
    { href: base, label: t("overview"), exact: true },
    { href: `${base}/kontrollen`, label: t("kontrollen"), exact: false },
    { href: `${base}/vorgaben`, label: t("vorgaben"), exact: false },
    { href: `${base}/stats`, label: t("statsTitle"), exact: false },
  ];

  return (
    <div className="sticky top-[108px] z-10 bg-surface border-b border-border-subtle">
      <div className="flex overflow-x-auto px-4 sm:px-6">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active
                  ? "border-[var(--color-lock)] text-[var(--color-lock)]"
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
