"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Checkbox from "@/app/components/Checkbox";
import Button from "@/app/components/Button";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { MAX_QUICK_SETTINGS, type QuickSetting } from "@/lib/quickSettings";

/**
 * Womit die Karte dieses Trägers in der Übersicht bestückt wird.
 *
 * Die Liste kommt fertig gefiltert vom Server (`quickSettingAvailable`) — hier steht nur, was für
 * diesen Träger überhaupt gilt. Eine Zeile, die ins Leere schaltete, wäre schlimmer als eine, die
 * fehlt: sie verspräche eine Wirkung, die die Einstellung ohne Box bzw. ohne Instanz-Schalter gar
 * nicht hat.
 *
 * Die Obergrenze wird HIER schon durchgesetzt und nicht erst beim Speichern: ein Kreuzchen, das der
 * Server stumm wegwirft, sieht aus wie ein Defekt. Volle Auswahl heisst deshalb, dass die übrigen
 * Kästchen nicht mehr annehmen — sichtbar gedämpft, mit dem Grund darüber.
 */
export default function QuickSettingsPicker({
  userId,
  available,
  initialKeys,
}: {
  userId: string;
  available: QuickSetting[];
  initialKeys: string[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const [keys, setKeys] = useState<string[]>(initialKeys);
  const [saved, setSaved] = useState<string[]>(initialKeys);

  const full = keys.length >= MAX_QUICK_SETTINGS;
  const dirty = JSON.stringify(keys) !== JSON.stringify(saved);

  // Die Auswahl steht IMMER in der Reihenfolge der Registratur, nicht in der des Anklickens. Zwei
  // Gründe: die Chips stehen damit auf jeder Karte gleich, und „geändert?" bleibt eine Frage an die
  // Auswahl statt an die Klick-Folge — ein Kästchen ab- und wieder anzuhaken meldete sonst eine
  // Änderung, obwohl dieselbe Liste herauskäme.
  function toggle(key: string) {
    setKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_QUICK_SETTINGS) return prev;
      const next = [...prev, key];
      return available.filter((s) => next.includes(s.key)).map((s) => s.key);
    });
  }

  async function handleSave() {
    if (await save({ quickSettings: keys })) setSaved(keys);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-foreground-faint">{t("quickSettingsHint", { max: MAX_QUICK_SETTINGS })}</p>
      {available.map((s) => {
        const checked = keys.includes(s.key);
        return (
          <Checkbox
            key={s.key}
            label={t(s.labelKey)}
            checked={checked}
            disabled={saving || (full && !checked)}
            onChange={() => toggle(s.key)}
          />
        );
      })}
      <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty} className="w-fit">
        {tc("save")}
      </Button>
    </div>
  );
}
