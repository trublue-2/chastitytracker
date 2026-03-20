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
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition text-lg font-bold"
        aria-label={t("ariaLabel")}
      >
        +
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-52 bg-white border border-gray-100 rounded-2xl shadow-lg z-30 overflow-hidden">
          <Link href="/dashboard/new/pruefung" onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-sm text-gray-700">
            <ClipboardList size={18} className="text-orange-500 flex-shrink-0" />
            <div>
              <p className="font-semibold">{t("kontrolleTitle")}</p>
              <p className="text-xs text-gray-400">{t("kontrolleDesc")}</p>
            </div>
          </Link>
          <div className="border-t border-gray-50" />
          <Link href="/dashboard/new/orgasmus" onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-sm text-gray-700">
            <Droplets size={18} className="text-rose-500 flex-shrink-0" />
            <div>
              <p className="font-semibold">{t("orgasmusTitle")}</p>
              <p className="text-xs text-gray-400">{t("orgasmusDesc")}</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
