"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Lock, X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
  hasEmail: boolean;
  isLocked: boolean;
  hasOffeneAnforderung: boolean;
  hasActiveSperrzeit: boolean;
}

export default function VerschlussAnforderungButton({
  userId, hasEmail, isLocked, hasOffeneAnforderung, hasActiveSperrzeit,
}: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [deadlineH, setDeadlineH] = useState("24");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (art === "ANFORDERUNG" && (isLocked || !hasEmail || hasOffeneAnforderung)) return null;
  if (art === "SPERRZEIT" && (!isLocked || hasActiveSperrzeit)) return null;

  function reset() {
    setOpen(false); setMsg(""); setNachricht(""); setDeadlineH("24");
  }

  async function handleSubmit() {
    setLoading(true); setMsg("");
    try {
      const payload: Record<string, unknown> = {
        userId, art,
        nachricht: nachricht.trim() || undefined,
        dauerH: parseFloat(deadlineH) || 24,
      };

      const res = await fetch("/api/admin/verschluss-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLoading(false);
      if (res.ok) { reset(); router.refresh(); }
      else setMsg(data.error || t("kontrolleTitle"));
    } catch {
      setLoading(false);
      setMsg(t("kontrolleTitle"));
    }
  }

  const isAnforderung = art === "ANFORDERUNG";
  const label = isAnforderung ? t("requestLock") : t("setLockDuration");

  const btnBase = isAnforderung
    ? "text-[var(--color-request)] border-[var(--color-request-border)] bg-[var(--color-request-bg)] hover:opacity-80"
    : "text-[var(--color-sperrzeit)] border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] hover:opacity-80";
  const accentColor = isAnforderung ? "var(--color-request)" : "var(--color-sperrzeit)";
  const accentBg = isAnforderung ? "var(--color-request-bg)" : "var(--color-sperrzeit-bg)";
  const formInputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMsg(""); }}
        className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-2 transition ${btnBase}`}
      >
        <Lock size={11} />
        {label}
      </button>
    );
  }

  const modal = (
    <div data-theme="admin" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-background rounded-2xl border border-border overflow-hidden w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: accentBg }}>
              <Lock size={20} strokeWidth={2} style={{ color: accentColor }} />
            </div>
            <span className="text-base font-semibold text-foreground">{label}</span>
          </div>
          <button type="button" onClick={reset}
            className="text-foreground-faint hover:text-foreground transition p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">{t("messageLabel")}</label>
            <textarea
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value)}
              placeholder={t("messageLabel")}
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
              min={0.5} step={0.5}
              className={`w-24 ${formInputCls}`}
            />
            <span className="text-xs text-foreground-faint">h</span>
          </div>

          {msg && <p className="text-xs text-warn">{msg}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center justify-center gap-2 text-sm font-medium text-white rounded-xl px-4 py-3 disabled:opacity-50 transition hover:opacity-80"
            style={{ backgroundColor: accentColor }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {loading ? t("sending") : t("submit")}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
