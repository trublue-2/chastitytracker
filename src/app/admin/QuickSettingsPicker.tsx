"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Checkbox from "@/app/components/Checkbox";
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
 * **Jede Zeile trägt ihre Erklärung.** Ein Wort wie „Automatik" oder „Auto-Ablegen" sagt beim
 * Auswählen nicht, was es tut — und die Einstellung, die es meint, steht in einem anderen Kapitel,
 * das gerade zugeklappt sein dürfte. Auf dem Chip selbst bleibt es beim Wort: dort ist der Platz
 * knapp, und wer ihn drückt, hat ihn vorher hier ausgesucht.
 *
 * Gespeichert wird beim UMSCHALTEN, wie in den Nachbar-Abschnitten (Reinigung, Eskalation,
 * Gewicht) — kein Speichern-Knopf. Die Auswahl ist keine Eingabe, die man erst fertig tippt,
 * sondern ein Haken, dessen Wirkung sofort feststeht.
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
  const { saving, save } = useUserSettingsSave(userId);
  const [keys, setKeys] = useState<string[]>(initialKeys);

  const full = keys.length >= MAX_QUICK_SETTINGS;

  async function toggle(key: string) {
    const checked = keys.includes(key);
    // Die Auswahl steht IMMER in der Reihenfolge der Registratur, nicht in der des Anklickens: so
    // stehen die Chips auf jeder Karte gleich, und dieselbe Auswahl ergibt immer dieselbe Liste.
    const next = checked
      ? keys.filter((k) => k !== key)
      : available.filter((s) => s.key === key || keys.includes(s.key)).map((s) => s.key);
    // Erst anzeigen, dann bestätigen lassen: der Haken darf nicht auf die Antwort warten. Lehnt der
    // Server ab, springt er zurück. Bewusst ANDERS als `NumberInput`/`TimeInput` nebenan, die den
    // neuen Wert erst nach der Zusage zeigen: ein Kästchen, das nach dem Klick eine Rundreise lang
    // leer bleibt, liest sich als nicht angekommen — eine Zahl, die noch kurz die alte ist, nicht.
    setKeys(next);
    if (!(await save({ quickSettings: next }))) setKeys(keys);
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-foreground-faint">{t("quickSettingsHint", { max: MAX_QUICK_SETTINGS })}</p>
      {available.map((s) => {
        const checked = keys.includes(s.key);
        // EIN Prädikat für Anzeige und Handler: dreimal formuliert liefe die Sperre irgendwann an
        // einer der drei Stellen anders — und ein Kästchen, das gedämpft aussieht, aber annimmt,
        // ist schlimmer als eines, das offen ablehnt.
        const blocked = saving || (full && !checked);
        return (
          <Checkbox
            key={s.key}
            label={t(s.labelKey)}
            description={t(s.descKey)}
            checked={checked}
            // `aria-disabled` statt `disabled`: ein abgeschaltetes Kästchen, das gerade den Fokus
            // hält, gäbe ihn an den Dokumentanfang ab. Die Schranke steht im Handler.
            aria-disabled={blocked}
            onChange={() => { if (!blocked) void toggle(s.key); }}
          />
        );
      })}
    </div>
  );
}
