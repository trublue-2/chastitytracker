"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { LOCALES } from "@/lib/constants";
import SegmentedControl from "@/app/components/SegmentedControl";
import { useLocaleSwitcher } from "@/app/hooks/useLocaleSwitcher";

interface Props {
  username: string;
  settingsHref: string;
  theme: "user" | "admin";
  version?: string;
}

export default function AvatarMenu({ username, settingsHref, theme, version }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("nav");
  const locale = useLocale();
  const switchLocale = useLocaleSwitcher();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const initial = username?.[0]?.toUpperCase() ?? "?";

  const avatarBg = "bg-header-avatar-bg text-header-avatar-text";
  const menuBg = "bg-surface border border-border shadow-overlay";
  const itemBase = "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors w-full text-left";
  const itemNormal = `${itemBase} text-foreground-muted hover:text-foreground hover:bg-surface-raised`;
  const itemDanger = `${itemBase} text-warn hover:bg-warn-bg`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80 ${avatarBg}`}
        aria-label={t("menu")}
      >
        {initial}
      </button>

      {open && (
        <>
          <div
            className="sm:hidden fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className={`absolute right-0 top-10 z-50 w-52 rounded-2xl overflow-hidden ${menuBg}`}>
            <div className="px-4 py-3 border-b border-border text-foreground-faint text-xs font-semibold uppercase tracking-wider">
              {username}
            </div>
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-xs font-medium text-foreground-faint mr-auto">{t("language")}</span>
              <SegmentedControl
                options={LOCALES}
                value={locale}
                onChange={switchLocale}
              />
            </div>
            <div className="border-t border-border-subtle" />
            <Link href={settingsHref} onClick={() => setOpen(false)} className={itemNormal}>
              <Settings size={16} strokeWidth={1.75} />
              {t("settings")}
            </Link>
            <div className="border-t border-border-subtle" />
            <button
              onClick={() => { setOpen(false); if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
              className={itemDanger}
            >
              <LogOut size={16} strokeWidth={1.75} />
              {t("signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
