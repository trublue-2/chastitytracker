"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ClipboardList, Droplets } from "lucide-react";
import { useTranslations } from "next-intl";

export default function MoreMenu() {
  const t = useTranslations("moreMenu");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border text-foreground-muted hover:bg-surface-raised hover:text-foreground transition text-lg font-bold"
        aria-label={t("ariaLabel")}
      >
        +
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-52 bg-surface border border-border rounded-2xl shadow-overlay z-30 overflow-hidden">
          <Link href="/dashboard/new/pruefung" onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised transition text-sm text-foreground-muted">
            <ClipboardList size={18} className="text-[var(--color-inspect)] flex-shrink-0" />
            <div>
              <p className="font-semibold text-foreground">{t("kontrolleTitle")}</p>
              <p className="text-xs text-foreground-faint">{t("kontrolleDesc")}</p>
            </div>
          </Link>
          <div className="border-t border-border-subtle" />
          <Link href="/dashboard/new/orgasmus" onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised transition text-sm text-foreground-muted">
            <Droplets size={18} className="text-[var(--color-orgasm)] flex-shrink-0" />
            <div>
              <p className="font-semibold text-foreground">{t("orgasmusTitle")}</p>
              <p className="text-xs text-foreground-faint">{t("orgasmusDesc")}</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
