"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";

export default function KontrolleForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        router.push(`/admin/users/${userId}/aktionen`);
      } else {
        setError(data.error || tc("error"));
      }
    } catch {
      setSaving(false);
      setError(tc("networkError"));
    }
  }

  return (
    <ActionModal
      open={true}
      onClose={() => router.push(`/admin/users/${userId}/aktionen`)}
      title={t("kontrolleTitle")}
      icon={<Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
      iconBg="var(--color-inspect-bg)"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <Input type="number" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)} min={0.1} step={0.1} />
          </div>
          <span className="text-xs text-foreground-faint">h</span>
        </div>

        <FormError message={error} variant="compact" />

        <Button variant="primary" fullWidth loading={saving} type="submit" icon={<Bell size={16} />}>
          {t("kontrolleRequest")}
        </Button>
      </form>
    </ActionModal>
  );
}
