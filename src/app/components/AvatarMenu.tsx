"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, LogOut, FileText } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

interface Props {
  username: string;
  settingsHref: string;
  changelogHref: string;
  /** dark = admin theme, light = user theme */
  theme: "user" | "admin";
}

export default function AvatarMenu({ username, settingsHref, changelogHref, theme }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("nav");

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const initial = username?.[0]?.toUpperCase() ?? "?";

  const avatarBg = theme === "admin"
    ? "bg-indigo-500 text-white"
    : "bg-gray-900 text-white";

  const menuBg = theme === "admin"
    ? "bg-surface border border-border shadow-overlay"
    : "bg-white border border-border shadow-overlay";

  const itemBase = "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors w-full text-left";
  const itemNormal = theme === "admin"
    ? `${itemBase} text-foreground-muted hover:text-foreground hover:bg-surface-raised`
    : `${itemBase} text-gray-600 hover:text-gray-900 hover:bg-gray-50`;
  const itemDanger = theme === "admin"
    ? `${itemBase} text-color-warn hover:bg-color-warn-bg`
    : `${itemBase} text-red-500 hover:bg-red-50`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80 ${avatarBg}`}
        aria-label="Menü öffnen"
      >
        {initial}
      </button>

      {open && (
        <>
          {/* Backdrop (mobile) */}
          <div
            className="sm:hidden fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className={`absolute right-0 top-10 z-50 w-52 rounded-2xl overflow-hidden ${menuBg}`}>
            {/* Username */}
            <div className={`px-4 py-3 border-b border-border ${theme === "admin" ? "text-foreground-muted" : "text-gray-400"} text-xs font-semibold uppercase tracking-wider`}>
              {username}
            </div>
            <Link href={settingsHref} onClick={() => setOpen(false)} className={itemNormal}>
              <Settings size={16} strokeWidth={1.75} />
              {t("settings")}
            </Link>
            <Link href={changelogHref} onClick={() => setOpen(false)} className={itemNormal}>
              <FileText size={16} strokeWidth={1.75} />
              Changelog
            </Link>
            <div className={`border-t ${theme === "admin" ? "border-border-subtle" : "border-gray-100"}`} />
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
