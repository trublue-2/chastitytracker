"use client";

import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import type { PushDevice } from "@/app/hooks/usePushDevice";

/**
 * „Push erlauben" — die Anmeldung DIESES Geräts, als eine Zeile der Einstellungs-Liste.
 *
 * Die Zeile steht IMMER, auch wo nichts zu schalten ist. Vorher gab dieselbe Komponente in vier von
 * sechs Plattform-Zuständen nur einen Hinweistext zurück und während des Ladens gar nichts — in
 * einer Liste mit Haarlinien ist das ein Loch, und der Nutzer sah nicht, dass es Push überhaupt
 * gibt. Jetzt nennt die Zeile den Grund und lässt nur den Schalter weg; um dessen Mass kümmert sich
 * `Toggle` selbst (fehlender `onChange` → nur Beschriftung, gleiche Geometrie).
 *
 * Der Zustand kommt von aussen ({@link PushDevice}), weil die Kanal-Stufe darunter denselben braucht.
 */
export default function PushAllowRow({ device }: { device: PushDevice }) {
  const t = useTranslations("settings");

  // Geht es hier nicht, nennt die Zeile den Grund — und beim Laden bewusst nichts: ein „aus", das
  // eine Sekunde später auf „an" springt, liest sich wie ein Fehler.
  if (!device.switchable) {
    return (
      <div className="px-5 py-2">
        <Toggle
          label={t("pushAllowTitle")}
          description={device.hint ? t(device.hint.key) : undefined}
          tone={device.hint?.warn ? "warn" : undefined}
        />
      </div>
    );
  }

  return (
    <div className="px-5 py-2">
      <Toggle
        label={t("pushAllowTitle")}
        description={t(device.enabled ? "pushAllowOn" : "pushAllowOff")}
        checked={device.enabled}
        disabled={device.saving}
        onChange={device.setEnabled}
      />
    </div>
  );
}
