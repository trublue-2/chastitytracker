"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import Toggle from "@/app/components/Toggle";

type Fenster = { start: string; end: string };

export default function ReinigungToggle({
  userId,
  initialErlaubt,
  initialMaxMinuten,
  initialMaxProTag,
  initialFenster,
}: {
  userId: string;
  initialErlaubt: boolean;
  initialMaxMinuten: number;
  initialMaxProTag: number;
  initialFenster: Fenster[];
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [erlaubt, setErlaubt] = useState(initialErlaubt);
  const [maxMin, setMaxMin] = useState(initialMaxMinuten);
  const [maxProTag, setMaxProTag] = useState(initialMaxProTag);
  const [fenster, setFenster] = useState<Fenster[]>(initialFenster);
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

  // Fenster separat speichern (nur reinigungsFenster) — der Service lässt die anderen Felder
  // unberührt. Nur vollständige, sinnvolle Paare (start < end) gehen serverseitig durch.
  async function saveFenster(next: Fenster[]) {
    setFenster(next);
    setSaving(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reinigungsFenster: next.filter((f) => f.start && f.end && f.start < f.end) }),
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
          <div className="flex flex-col gap-2 pl-1">
            <span className="text-xs text-foreground-faint">Reinigungs-Fenster (täglich)</span>
            {fenster.length === 0 && (
              <span className="text-xs text-foreground-faint italic">Kein Fenster — Reinigung jederzeit (im Rahmen Sperrzeit + Kontingent).</span>
            )}
            {fenster.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={f.start}
                  disabled={saving}
                  onChange={(e) => saveFenster(fenster.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                  className={inputCls}
                />
                <span className="text-xs text-foreground-faint">–</span>
                <input
                  type="time"
                  value={f.end}
                  disabled={saving}
                  onChange={(e) => saveFenster(fenster.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => saveFenster(fenster.filter((_, j) => j !== i))}
                  disabled={saving}
                  aria-label="Fenster entfernen"
                  className="p-1 text-foreground-faint hover:text-foreground disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => saveFenster([...fenster, { start: "19:00", end: "20:00" }])}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50 w-fit"
            >
              <Plus size={14} /> Fenster hinzufügen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
