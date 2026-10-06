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
 * **Bei einer LockMeBox gilt der Riegel immer** (`lockAwaitsBolt`), der Schalter wirkt dort nicht — er
 * steht dann gesperrt auf „an" und sagt das (`alwaysOn`). Ein Schalter, der „aus" zeigt und trotzdem
 * wartet, wäre eine Auskunft, die nicht stimmt.
 *
 * Das Abschalten vollzieht einen gerade wartenden Aufruf sofort (`setLockRequiresBolt`) — deshalb
 * ist dieser Schalter zugleich der Weg heraus, wenn die Box nicht mehr meldet. Der Hinweis darunter
 * sagt das, denn im Moment der Panne sucht niemand in der Doku.
 */
export default function BoxLockToggle({
  userId,
  initialEnabled,
  alwaysOn = false,
}: {
  userId: string;
  initialEnabled: boolean;
  /** Der Träger führt eine LockMeBox: der Riegel gilt dort immer, der Schalter ist gesperrt. */
  alwaysOn?: boolean;
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
        checked={alwaysOn || enabled}
        disabled={alwaysOn || saving}
        onChange={handleToggle}
      />
      {alwaysOn
        ? <p className="text-xs text-foreground-faint">{t("boltGateAlways")}</p>
        : enabled && <p className="text-xs text-foreground-faint">{t("boltGateEscapeHint")}</p>}
    </div>
  );
}
