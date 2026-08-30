"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

/**
 * Der Riegel-Schalter der Keyholderin für EINEN Träger (docs/riegel-konzept.md).
 *
 * An: sein „Verschlossen" ist erst der AUFRUF an die Box — verschlossen ist er, wenn der Riegel
 * zufällt. Aus: Bestandsverhalten, der Eintrag gilt sofort.
 *
 * Das Abschalten vollzieht einen gerade wartenden Aufruf sofort (`setLockRequiresBolt`) — deshalb
 * ist dieser Schalter zugleich der Weg heraus, wenn die Box nicht mehr meldet. Der Hinweis darunter
 * sagt das, denn im Moment der Panne sucht niemand in der Doku.
 */
export default function BoxLockToggle({
  userId,
  initialEnabled,
}: {
  userId: string;
  initialEnabled: boolean;
}) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(userId);
  const [enabled, setEnabled] = useState(initialEnabled);

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    save({ lockRequiresBolt: checked });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("boltGateLabel")}
        description={t("boltGateDesc")}
        checked={enabled}
        disabled={saving}
        onChange={handleToggle}
      />
      {enabled && <p className="text-xs text-foreground-faint">{t("boltGateEscapeHint")}</p>}
    </div>
  );
}
