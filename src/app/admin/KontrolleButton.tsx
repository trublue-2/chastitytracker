"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

export default function KontrolleButton({ userId, hasEmail }: { userId: string; hasEmail: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!hasEmail) return null;

  function reset() {
    setOpen(false); setError(""); setKommentar(""); setDeadlineH("4");
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
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
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (res.ok) {
        reset();
        router.refresh();
      } else {
        setError(data.error || t("kontrolleTitle"));
      }
    } catch {
      setSaving(false);
      setError(t("kontrolleTitle"));
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-inspect)] border border-[var(--color-inspect-border)] bg-[var(--color-inspect-bg)] rounded-lg px-2.5 py-2 hover:opacity-80 transition"
      >
        <Bell size={11} />
        {t("requestInspection")}
      </button>

      <ActionModal
        open={open}
        onClose={reset}
        title={t("kontrolleTitle")}
        icon={<Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
        iconBg="var(--color-inspect-bg)"
      >
        <FormField label={t("kontrolleInstruction")}>
          <textarea
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
            placeholder={t("kontrolleInstruction")}
            rows={2}
            className={`${inputCls} w-full resize-none`}
          />
        </FormField>

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-faint whitespace-nowrap">{t("kontrolleHours")}</label>
          <input type="number" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)}
            min={0.5} step={0.5} className={`w-24 ${inputCls}`} />
          <span className="text-xs text-foreground-faint">h</span>
        </div>

        <FormError message={error} variant="compact" />

        <button onClick={handleSubmit} disabled={saving}
          className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] rounded-xl px-4 py-3 disabled:opacity-50 transition">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
          {saving ? t("sending") : t("kontrolleRequest")}
        </button>
      </ActionModal>
    </>
  );
}
