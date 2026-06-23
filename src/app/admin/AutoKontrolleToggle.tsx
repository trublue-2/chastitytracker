"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";

export default function AutoKontrolleToggle({
  userId,
  initialAktiv,
  initialProTag,
  initialRuheVon,
  initialRuheBis,
  initialFristVon,
  initialFristBis,
}: {
  userId: string;
  initialAktiv: boolean;
  initialProTag: number;
  initialRuheVon: string;
  initialRuheBis: string;
  initialFristVon: number;
  initialFristBis: number;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [aktiv, setAktiv] = useState(initialAktiv);
  const [proTag, setProTag] = useState(initialProTag);
  const [ruheVon, setRuheVon] = useState(initialRuheVon);
  const [ruheBis, setRuheBis] = useState(initialRuheBis);
  const [fristVon, setFristVon] = useState(initialFristVon);
  const [fristBis, setFristBis] = useState(initialFristBis);
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    router.refresh();
  }

  function handleToggle(checked: boolean) {
    setAktiv(checked);
    save({ autoKontrolleAktiv: checked });
  }

  const clampInput = (v: string, min: number, max: number, fb: number) => Math.max(min, Math.min(max, Number(v) || fb));

  const inputCls = "w-16 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20";

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("autoKontrolleLabel")}
        description={t("autoKontrolleDesc")}
        checked={aktiv}
        disabled={saving}
        onChange={handleToggle}
      />
      {aktiv && (
        <>
          {/* Anzahl pro Tag */}
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs text-foreground-faint">{t("autoKontrolleProTagLabel")}</span>
            <input
              type="number"
              min={0}
              max={12}
              value={proTag}
              onChange={(e) => setProTag(clampInput(e.target.value, 0, 12, 0))}
              onBlur={() => save({ autoKontrolleProTag: proTag })}
              disabled={saving}
              className={inputCls}
            />
            <span className="text-xs text-foreground-faint">{t("autoKontrolleProTagHint")}</span>
          </div>

          {/* Schlaf-Fenster (Frist darf hier nicht liegen) */}
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs text-foreground-faint">{t("autoKontrolleRuheLabel")}</span>
            <input
              type="time"
              value={ruheVon}
              disabled={saving}
              onChange={(e) => { setRuheVon(e.target.value); save({ autoKontrolleRuheVon: e.target.value }); }}
              className={inputCls}
            />
            <span className="text-xs text-foreground-faint">–</span>
            <input
              type="time"
              value={ruheBis}
              disabled={saving}
              onChange={(e) => { setRuheBis(e.target.value); save({ autoKontrolleRuheBis: e.target.value }); }}
              className={inputCls}
            />
          </div>

          {/* Erfüllungsdauer von–bis (Minuten) */}
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs text-foreground-faint">{t("autoKontrolleFristLabel")}</span>
            <input
              type="number"
              min={5}
              max={240}
              value={fristVon}
              onChange={(e) => setFristVon(clampInput(e.target.value, 5, 240, 15))}
              onBlur={() => save({ autoKontrolleFristVon: fristVon })}
              disabled={saving}
              className={inputCls}
            />
            <span className="text-xs text-foreground-faint">–</span>
            <input
              type="number"
              min={5}
              max={240}
              value={fristBis}
              onChange={(e) => setFristBis(clampInput(e.target.value, 5, 240, 60))}
              onBlur={() => save({ autoKontrolleFristBis: fristBis })}
              disabled={saving}
              className={inputCls}
            />
            <span className="text-xs text-foreground-faint">min</span>
          </div>
        </>
      )}
    </div>
  );
}
