"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function CreateDemoUserButton() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/admin/demo", { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      setLoading(false);
    }
  }

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
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex-shrink-0 inline-flex items-center gap-1.5 bg-foreground text-background text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-80 active:scale-95 transition-all disabled:opacity-50"
      >
        {loading ? t("creatingUser") : t("demoCreateBtn")}
      </button>
    </div>
  );
}
