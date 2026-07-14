"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

/**
 * Shared form body for "Kontrolle anfordern".
 * Caller wraps this in an ActionModal and provides onSuccess.
 */
export default function KontrolleFields({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
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
      if (res.ok) onSuccess();
      else setError(apiError(await parseApiErrorCode(res)));
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
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

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<Bell size={16} />}>
        {t("kontrolleRequest")}
      </Button>
    </form>
  );
}
