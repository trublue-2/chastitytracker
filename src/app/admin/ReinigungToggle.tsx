"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReinigungToggle({
  userId,
  initialErlaubt,
  initialMaxMinuten,
}: {
  userId: string;
  initialErlaubt: boolean;
  initialMaxMinuten: number;
}) {
  const router = useRouter();
  const [erlaubt, setErlaubt] = useState(initialErlaubt);
  const [maxMin, setMaxMin] = useState(initialMaxMinuten);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(newErlaubt: boolean, newMaxMin: number) {
    setSaving(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reinigungErlaubt: newErlaubt, reinigungMaxMinuten: newMaxMin }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  function handleToggle(checked: boolean) {
    setErlaubt(checked);
    save(checked, maxMin);
  }

  function handleMinuten(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(1, Math.min(120, Number(e.target.value) || 15));
    setMaxMin(val);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={erlaubt}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={saving}
          className="w-4 h-4 rounded accent-[var(--color-request)]"
        />
        <span className="text-xs font-medium text-foreground-faint">Reinigung</span>
      </label>
      {erlaubt && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={120}
            value={maxMin}
            onChange={handleMinuten}
            onBlur={() => save(erlaubt, maxMin)}
            disabled={saving}
            className="w-14 border border-border rounded-lg px-2 py-1 text-sm text-foreground-muted focus:outline-none focus:ring-2 focus:ring-foreground-muted bg-surface-raised"
          />
          <span className="text-xs text-foreground-faint">min</span>
        </div>
      )}
      {saved && <span className="text-xs text-[var(--color-ok)]">✓</span>}
    </div>
  );
}
