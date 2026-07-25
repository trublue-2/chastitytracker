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
  /** Bereits übersetzte Beschriftung. BEWUSST kein i18n-Key: der Knopf wäre sonst auf den
   *  `admin`-Namespace festgelegt, und die Aufgaben-Texte liegen im `tasks`-Namespace — genau der
   *  Sonderfall, der sonst als zweite, konkurrierende Prop hätte danebengestellt werden müssen. */
  title: string;
  /** Beschriftung auch ANZEIGEN statt nur als Tooltip. In dichten Listenzeilen genügt das Kreuz; auf
   *  einer Karte ist ein 16-px-Icon ohne Wort keine erkennbare Aktion. */
  showLabel?: boolean;
  /** Semantic color token, e.g. "inspect" or "sperrzeit" */
  colorToken: "inspect" | "sperrzeit" | "orgasm" | "neutral";
}

const colorClasses: Record<Props["colorToken"], string> = {
  inspect:   "text-[var(--color-inspect)] hover:bg-[var(--color-inspect-bg)]",
  sperrzeit: "text-[var(--color-sperrzeit)] hover:bg-[var(--color-sperrzeit-bg)]",
  orgasm:    "text-[var(--color-orgasm)] hover:bg-[var(--color-orgasm-bg)]",
  neutral:   "text-foreground-muted hover:bg-surface-raised",
};

export default function WithdrawButton({ id, apiPath, title, showLabel, colorToken }: Props) {
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
        title={title}
        className={`flex items-center rounded-full active:scale-90 disabled:opacity-50 transition ${
          showLabel ? "gap-1.5 min-h-12 px-3 text-sm font-medium" : "p-1.5 -m-1"
        } ${colorClasses[colorToken]}`}
      >
        <X size={16} strokeWidth={2.5} />
        {showLabel && title}
      </button>
      <FormError message={error} />
    </>
  );
}
