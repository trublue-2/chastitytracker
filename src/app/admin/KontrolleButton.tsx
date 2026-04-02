"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function KontrolleButton({ userId, hasEmail }: { userId: string; hasEmail: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!hasEmail) return null;

  async function handleSubmit() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          kommentar: kommentar.trim() || undefined,
          deadlineH: parseFloat(deadlineH) || 4,
        }),
      });
      const data = await res.json();
      setLoading(false);
      if (res.ok) {
        setMsg(t("requestedSuccess"));
        setOpen(false);
        setKommentar("");
        setDeadlineH("4");
        router.refresh();
      } else {
        setMsg(data.error || t("kontrolleTitle"));
      }
    } catch (err) {
      setLoading(false);
      console.error("[KontrolleButton]", err);
      setMsg(t("kontrolleTitle"));
    }
  }

  const formInputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMsg(""); }}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-inspect)] border border-[var(--color-inspect-border)] bg-[var(--color-inspect-bg)] rounded-lg px-2.5 py-2 hover:opacity-80 transition"
      >
        <Bell size={11} />
        {t("requestInspection")}
      </button>
    );
  }

  const modal = (
    <div data-theme="admin" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-background rounded-2xl border border-border overflow-hidden w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-inspect-bg)" }}>
              <Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
            </div>
            <span className="text-base font-semibold text-foreground">{t("kontrolleTitle")}</span>
          </div>
          <button type="button" onClick={() => { setOpen(false); setMsg(""); setKommentar(""); setDeadlineH("4"); }}
            className="text-foreground-faint hover:text-foreground transition p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">{t("kontrolleInstruction")}</label>
            <textarea
              value={kommentar}
              onChange={(e) => setKommentar(e.target.value)}
              placeholder={t("kontrolleInstruction")}
              rows={2}
              className={`${formInputCls} w-full resize-none`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-foreground-faint whitespace-nowrap">{t("kontrolleHours")}</label>
            <input
              type="number"
              value={deadlineH}
              onChange={(e) => setDeadlineH(e.target.value)}
              min={0.5}
              step={0.5}
              className={`w-24 ${formInputCls}`}
            />
            <span className="text-xs text-foreground-faint">h</span>
          </div>

          {msg && <p className="text-xs text-warn">{msg}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] rounded-xl px-4 py-3 disabled:opacity-50 transition"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
            {loading ? t("sending") : t("kontrolleRequest")}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
