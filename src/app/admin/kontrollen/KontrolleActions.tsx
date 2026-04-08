"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, CheckCircle2, X, MinusCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";

interface Props {
  kontrolleId: string | null;
  entryId: string | null;
  anforderungStatus: AnforderungStatus;
  verifikationStatus: VerifikationStatus | null;
}

export default function KontrolleActions({ kontrolleId, entryId, anforderungStatus, verifikationStatus }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canWithdraw = !!kontrolleId && (anforderungStatus === "open" || anforderungStatus === "overdue");
  const canDelete = !!kontrolleId && anforderungStatus === "withdrawn";
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

  const [error, setError] = useState<string | null>(null);

  async function doAction(action: string) {
    setOpen(false);
    setError(null);
    try {
      let res: Response | undefined;
      if (action === "delete" && kontrolleId) {
        res = await fetch(`/api/admin/kontrollen/${kontrolleId}`, { method: "DELETE" });
      } else if (action === "withdraw" && kontrolleId) {
        res = await fetch(`/api/admin/kontrollen/${kontrolleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "withdraw" }),
        });
      } else if (action === "manuallyVerify" && entryId) {
        res = await fetch(`/api/entries/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verifikationStatus: "manual" }),
        });
      } else if (action === "reject" && entryId) {
        res = await fetch(`/api/entries/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verifikationStatus: "rejected" }),
        });
      }
      if (res && !res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? tc("savingError"));
        return;
      }
      router.refresh();
    } catch {
      setError(tc("networkError"));
    }
  }

  return (
    <div className="relative flex-shrink-0">
      {error && (
        <p className="absolute right-0 top-full mt-1 text-xs text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-lg px-2 py-1 whitespace-nowrap z-50">{error}</p>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-label={t("kontrolleAriaActions")}
        className="size-6 flex items-center justify-center rounded-lg text-foreground-faint hover:text-foreground-muted hover:bg-surface-raised active:bg-surface-raised transition"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed w-44 bg-surface border border-border rounded-xl shadow-overlay z-50 overflow-hidden"
        >
          {canManuallyVerify && (
            <button
              type="button"
              onClick={() => doAction("manuallyVerify")}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-[var(--color-ok)] hover:bg-ok-bg transition"
            >
              <CheckCircle2 size={14} />
              {t("kontrolleVerifyBtn")}
            </button>
          )}
          {canReject && (
            <>
              {canManuallyVerify && <div className="border-t border-border-subtle" />}
              <button
                type="button"
                onClick={() => doAction("reject")}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-warn hover:bg-warn-bg transition"
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
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:bg-surface-raised transition"
            >
              <MinusCircle size={14} />
              {t("kontrolleWithdrawBtn")}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => doAction("delete")}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-warn hover:bg-warn-bg transition"
            >
              <Trash2 size={14} />
              {t("kontrolleDeleteBtn")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
