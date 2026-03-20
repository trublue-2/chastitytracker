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
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-800">{t("demoTitle")}</p>
        <p className="text-xs text-amber-600 mt-0.5">
          {t("demoDesc")}{" "}
          <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-900">
            demo1234
          </code>
        </p>
      </div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex-shrink-0 inline-flex items-center gap-1.5 bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-50"
      >
        {loading ? t("creatingUser") : t("demoCreateBtn")}
      </button>
    </div>
  );
}
