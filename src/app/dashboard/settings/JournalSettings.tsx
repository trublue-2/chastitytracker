"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Select from "@/app/components/Select";
import Toggle from "@/app/components/Toggle";
import { useSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { JOURNAL_VISIBILITIES, type JournalVisibility } from "@/lib/shared/constants";

export interface JournalSettingsProps {
  defaultVisibility: JournalVisibility;
  promptsEnabled: boolean;
}

/** Die Tagebuch-Einstellungen des Subs. Sie gehören allein ihm — die Keyholderin sieht sie nicht. */
export default function JournalSettings({ defaultVisibility, promptsEnabled }: JournalSettingsProps) {
  const t = useTranslations("journal");
  const { saving, save } = useSettingsSave("/api/settings/journal", { refresh: false });
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [prompts, setPrompts] = useState(promptsEnabled);

  async function saveVisibility(next: string) {
    const previous = visibility;
    setVisibility(next as JournalVisibility);
    if (!(await save({ defaultVisibility: next }))) setVisibility(previous);
  }

  async function savePrompts(next: boolean) {
    setPrompts(next);
    if (!(await save({ promptsEnabled: next }))) setPrompts(!next);
  }

  return (
    <div className="flex flex-col gap-5">
      <Select
        label={t("settingsDefault")}
        hint={t("settingsDefaultHint")}
        value={visibility}
        disabled={saving}
        onChange={(e) => saveVisibility(e.target.value)}
        options={JOURNAL_VISIBILITIES.map((v) => ({ value: v, label: t(`vis${v}`) }))}
      />
      <Toggle
        label={t("settingsPrompts")}
        description={t("settingsPromptsHint")}
        checked={prompts}
        disabled={saving}
        onChange={savePrompts}
      />
      <p className="text-neben text-foreground-faint">{t("operatorNote")}</p>
    </div>
  );
}
