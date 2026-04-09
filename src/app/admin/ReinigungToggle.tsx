"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";

export default function ReinigungToggle({
  userId,
  initialErlaubt,
  initialMaxMinuten,
  initialMaxProTag,
}: {
  userId: string;
  initialErlaubt: boolean;
  initialMaxMinuten: number;
  initialMaxProTag: number;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [erlaubt, setErlaubt] = useState(initialErlaubt);
  const [maxMin, setMaxMin] = useState(initialMaxMinuten);
  const [maxProTag, setMaxProTag] = useState(initialMaxProTag);
  const [saving, setSaving] = useState(false);

  async function save(newErlaubt: boolean, newMaxMin: number, newMaxProTag: number) {
    setSaving(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reinigungErlaubt: newErlaubt, reinigungMaxMinuten: newMaxMin, reinigungMaxProTag: newMaxProTag }),
    });
    setSaving(false);
    router.refresh();
  }

  function handleToggle(checked: boolean) {
    setErlaubt(checked);
    save(checked, maxMin, maxProTag);
  }

  function handleMinuten(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(1, Math.min(120, Number(e.target.value) || 15));
    setMaxMin(val);
  }

  function handleMaxProTag(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(0, Math.min(20, Number(e.target.value) || 0));
    setMaxProTag(val);
  }

  const inputCls = "w-16 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20";

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("reinigungPausenLabel")}
        description={t("reinigungPausenDesc")}
        checked={erlaubt}
        disabled={saving}
        onChange={handleToggle}
      />
      {erlaubt && (
        <>
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs text-foreground-faint">{t("reinigungMaxLabel")}</span>
            <input
              type="number"
              min={1}
              max={120}
              value={maxMin}
              onChange={handleMinuten}
              onBlur={() => save(erlaubt, maxMin, maxProTag)}
              disabled={saving}
              className={inputCls}
            />
            <span className="text-xs text-foreground-faint">min</span>
          </div>
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs text-foreground-faint">{t("reinigungMaxProTagLabel")}</span>
            <input
              type="number"
              min={0}
              max={20}
              value={maxProTag}
              onChange={handleMaxProTag}
              onBlur={() => save(erlaubt, maxMin, maxProTag)}
              disabled={saving}
              className={inputCls}
            />
            <span className="text-xs text-foreground-faint">{t("reinigungMaxProTagHint")}</span>
          </div>
        </>
      )}
    </div>
  );
}
