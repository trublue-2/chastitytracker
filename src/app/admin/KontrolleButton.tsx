"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";

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
        <Textarea
          label={t("kontrolleInstruction")}
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          placeholder={t("kontrolleInstruction")}
          rows={2}
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-faint whitespace-nowrap">{t("kontrolleHours")}</label>
          <div className="w-24">
            <Input
              type="number"
              value={deadlineH}
              onChange={(e) => setDeadlineH(e.target.value)}
              min={0.1}
              step={0.1}
            />
          </div>
          <span className="text-xs text-foreground-faint">h</span>
        </div>

        <FormError message={error} variant="compact" />

        <Button variant="primary" fullWidth loading={saving} icon={<Bell size={16} />} onClick={handleSubmit}>
          {t("kontrolleRequest")}
        </Button>
      </ActionModal>
    </>
  );
}
