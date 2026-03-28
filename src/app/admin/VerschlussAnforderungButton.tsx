"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, X } from "lucide-react";
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

  // Token-based class strings (no dynamic Tailwind class building)
  const btnBase = isAnforderung
    ? "text-[var(--color-request)] border-[var(--color-request-border)] bg-[var(--color-request-bg)] hover:opacity-80"
    : "text-[var(--color-sperrzeit)] border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] hover:opacity-80";
  const panelBase = isAnforderung
    ? "bg-[var(--color-request-bg)] border-[var(--color-request-border)]"
    : "bg-[var(--color-sperrzeit-bg)] border-[var(--color-sperrzeit-border)]";
  const titleCls = isAnforderung ? "text-[var(--color-request-text)]" : "text-[var(--color-sperrzeit-text)]";
  const closeCls = isAnforderung ? "text-[var(--color-request)] hover:opacity-70" : "text-[var(--color-sperrzeit)] hover:opacity-70";
  const textareaCls = isAnforderung
    ? "border-[var(--color-request-border)] focus:ring-[var(--color-request)]"
    : "border-[var(--color-sperrzeit-border)] focus:ring-[var(--color-sperrzeit)]";
  const inputCls = isAnforderung
    ? "border-[var(--color-request-border)] focus:ring-[var(--color-request)]"
    : "border-[var(--color-sperrzeit-border)] focus:ring-[var(--color-sperrzeit)]";
  const sendCls = isAnforderung
    ? "bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)]"
    : "bg-[var(--color-sperrzeit)] hover:opacity-80";

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

  return (
    <div className={`flex flex-col gap-2 p-3 border rounded-xl ${panelBase}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${titleCls}`}>{label}</span>
        <button type="button" onClick={reset} className={`transition ${closeCls}`}>
          <X size={14} />
        </button>
      </div>

      <textarea
        value={nachricht}
        onChange={(e) => setNachricht(e.target.value)}
        placeholder={t("messageLabel")}
        rows={2}
        className={`w-full text-xs bg-surface border rounded-lg px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 resize-none ${textareaCls}`}
      />

      <div className="flex items-center gap-2">
        <label className={`text-xs font-medium whitespace-nowrap ${titleCls}`}>{t("kontrolleHours")}</label>
        <input
          type="number"
          value={deadlineH}
          onChange={(e) => setDeadlineH(e.target.value)}
          min={0.5} step={0.5}
          className={`w-20 text-xs bg-surface border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 ${inputCls}`}
        />
        <span className={`text-xs ${titleCls}`}>h</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`flex items-center gap-1.5 text-xs font-medium text-[var(--btn-primary-text)] rounded-lg px-3 py-1.5 disabled:opacity-50 transition ${sendCls}`}
        >
          <Lock size={11} />
          {loading ? t("sending") : t("submit")}
        </button>
        {msg && <p className="text-xs text-warn">{msg}</p>}
      </div>
    </div>
  );
}
