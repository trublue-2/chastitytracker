"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function KontrolleButton({ userId, hasEmail }: { userId: string; hasEmail: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

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

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => { setOpen(true); setMsg(""); }}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-inspect)] border border-[var(--color-inspect-border)] bg-[var(--color-inspect-bg)] rounded-lg px-2.5 py-1 hover:opacity-80 transition"
        >
          <Bell size={11} />
          {t("requestInspection")}
        </button>
        {msg && <p className="text-xs text-foreground-faint">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-[var(--color-inspect-bg)] border border-[var(--color-inspect-border)] rounded-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--color-inspect-text)]">{t("kontrolleTitle")}</span>
        <button type="button" onClick={() => { setOpen(false); setMsg(""); setKommentar(""); setDeadlineH("4"); }}
          className="text-[var(--color-inspect)] hover:opacity-70 transition">
          <X size={14} />
        </button>
      </div>
      <textarea
        value={kommentar}
        onChange={(e) => setKommentar(e.target.value)}
        placeholder={t("kontrolleInstruction")}
        rows={2}
        className="w-full text-xs bg-surface border border-[var(--color-inspect-border)] rounded-lg px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-[var(--color-inspect)] resize-none"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--color-inspect-text)] font-medium whitespace-nowrap">{t("kontrolleHours")}</label>
        <input
          type="number"
          value={deadlineH}
          onChange={(e) => setDeadlineH(e.target.value)}
          min={0.5}
          step={0.5}
          className="w-20 text-xs bg-surface border border-[var(--color-inspect-border)] rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--color-inspect)]"
        />
        <span className="text-xs text-[var(--color-inspect)]">h</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] rounded-lg px-3 py-1.5 hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition"
        >
          <Bell size={11} />
          {loading ? t("sending") : t("kontrolleRequest")}
        </button>
        {msg && <p className="text-xs text-warn">{msg}</p>}
      </div>
    </div>
  );
}
