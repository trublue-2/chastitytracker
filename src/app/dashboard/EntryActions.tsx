"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  id: string;
  editHref: string;
}

export default function EntryActions({ id, editHref }: Props) {
  const t = useTranslations("entryActions");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  async function handleDelete() {
    setOpen(false);
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/entries/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
        aria-label={t("ariaActions")}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed w-36 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          <Link
            href={editHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <Pencil size={14} className="text-gray-400" />
            {t("edit")}
          </Link>
          <div className="border-t border-gray-50" />
          <button
            type="button"
            onClick={handleDelete}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition"
          >
            <Trash2 size={14} />
            {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}
