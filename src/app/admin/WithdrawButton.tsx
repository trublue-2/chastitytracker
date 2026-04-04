"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import FormError from "@/app/components/FormError";

interface Props {
  id: string;
  /** API base path, e.g. "/api/admin/kontrollen" */
  apiPath: string;
  /** i18n key within "admin" namespace for the button title */
  titleKey: string;
  /** Semantic color token, e.g. "inspect" or "sperrzeit" */
  colorToken: "inspect" | "sperrzeit";
}

const colorClasses: Record<Props["colorToken"], string> = {
  inspect:   "text-[var(--color-inspect)] hover:bg-[var(--color-inspect-bg)]",
  sperrzeit: "text-[var(--color-sperrzeit)] hover:bg-[var(--color-sperrzeit-bg)]",
};

export default function WithdrawButton({ id, apiPath, titleKey, colorToken }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handle() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      if (!res.ok) throw new Error(tc("savingError"));
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={handle}
        disabled={saving}
        title={t(titleKey)}
        className={`p-1.5 -m-1 flex items-center rounded-full active:scale-90 disabled:opacity-50 transition ${colorClasses[colorToken]}`}
      >
        <X size={16} strokeWidth={2.5} />
      </button>
      <FormError message={error} />
    </>
  );
}
