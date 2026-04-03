"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

const DISMISS_KEY = "demo_banner_dismissed";

export default function CreateDemoUserButton() {
  const t = useTranslations("admin");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const router = useRouter();

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function handleClick() {
    setSaving(true);
    const res = await fetch("/api/admin/demo", { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      setSaving(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className="bg-warn-bg border border-[var(--color-warn-border)] rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-warn-text)]">{t("demoTitle")}</p>
        <p className="text-xs text-[var(--color-warn)] mt-0.5">
          {t("demoDesc")}{" "}
          <code className="font-mono bg-[var(--color-warn-bg)] px-1.5 py-0.5 rounded text-[var(--color-warn-text)]">
            demo1234
          </code>
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleClick}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-foreground text-background text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-80 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? t("creatingUser") : t("demoCreateBtn")}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-[var(--color-warn)] hover:bg-[var(--color-warn-border)] transition-colors"
          aria-label="Ausblenden"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
