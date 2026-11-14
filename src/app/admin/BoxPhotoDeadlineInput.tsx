"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import NumberInput from "@/app/components/NumberInput";
import SettingLabel from "@/app/components/SettingLabel";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { BOX_PHOTO_DEADLINE_HOURS_RANGE } from "@/lib/constants";

/**
 * Frist für das Box-Foto nach „Riegel zu" (Stunden). Wirkt nur, wenn die Vergehensart „Box-Foto fehlt"
 * bei diesem Träger scharf ist — die Erklärung sagt das, damit die Zahl nicht für eine Strafe gehalten
 * wird, die gar nicht gilt.
 */
export default function BoxPhotoDeadlineInput({ userId, initialHours }: { userId: string; initialHours: number }) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(userId);
  const [hours, setHours] = useState(initialHours);

  async function commit(n: number): Promise<boolean> {
    const ok = await save({ boxPhotoDeadlineHours: n });
    if (ok) setHours(n);
    return ok;
  }

  return (
    <div className="flex flex-col gap-2">
      <SettingLabel label={t("boxPhotoDeadlineLabel")} description={t("boxPhotoDeadlineDesc")} />
      <InlineSettingRow label={t("boxPhotoDeadlineHours")} unit="h">
        <NumberInput value={hours} range={BOX_PHOTO_DEADLINE_HOURS_RANGE} disabled={saving}
          ariaLabel={t("boxPhotoDeadlineHours")} onCommit={commit} />
      </InlineSettingRow>
    </div>
  );
}
