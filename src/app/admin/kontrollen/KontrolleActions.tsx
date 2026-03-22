"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, CheckCircle2, X, MinusCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  kontrolleId: string | null;
  entryId: string | null;
  anforderungStatus: string;
  verifikationStatus: string | null;
}

export default function KontrolleActions({ kontrolleId, entryId, anforderungStatus, verifikationStatus }: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canWithdraw = !!kontrolleId && (anforderungStatus === "open" || anforderungStatus === "overdue");
  const canManuallyVerify = !!entryId && verifikationStatus !== "manual" && verifikationStatus !== "ai";
  const canReject = !!entryId && verifikationStatus !== "rejected";

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

  async function doAction(action: string) {
    setOpen(false);
    if (action === "withdraw" && kontrolleId) {
      await fetch(`/api/admin/kontrollen/${kontrolleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
    } else if (action === "manuallyVerify" && entryId) {
      await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifikationStatus: "manual" }),
      });
    } else if (action === "reject" && entryId) {
      await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifikationStatus: "rejected" }),
      });
    }
    router.refresh();
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed w-44 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {canManuallyVerify && (
            <button
              type="button"
              onClick={() => doAction("manuallyVerify")}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 transition"
            >
              <CheckCircle2 size={14} />
              {t("kontrolleVerifyBtn")}
            </button>
          )}
          {canReject && (
            <>
              {canManuallyVerify && <div className="border-t border-gray-50" />}
              <button
                type="button"
                onClick={() => doAction("reject")}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition"
              >
                <X size={14} />
                {t("kontrolleRejectBtn")}
              </button>
            </>
          )}
          {canWithdraw && (
            <button
              type="button"
              onClick={() => doAction("withdraw")}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition"
            >
              <MinusCircle size={14} />
              {t("kontrolleWithdrawBtn")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
