"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { busyDimCls, overviewChipCls } from "@/app/components/inputStyles";

/**
 * Ein Schnellschalter auf der Karte eines Trägers: Zustand ablesen, mit einem Griff umlegen.
 *
 * **Er zeigt einen ZUSTAND, keine Handlung** — und muss sich deshalb von den Schnellaktionen
 * daneben („Kontrolle anfordern", „Sofort aufschliessen") unterscheiden. Die tun etwas Einmaliges
 * und öffnen dafür einen Dialog; dieser hier sagt, wie es gerade steht, und kippt es. Läse man ihn
 * als Aktion, drückte man ihn in der Erwartung, eine Kontrolle auszulösen.
 *
 * Geschrieben wird über dieselbe Sammel-Route wie in den Einstellungen — der Chip schickt genau ein
 * Feld und erbt damit den Fachdienst dahinter samt Historie und Folgewirkungen (siehe
 * `quickSettings.ts`). Kein eigener Endpunkt, der die Spalte direkt setzt.
 *
 * Keine Rückfrage: der Schalter ist mit demselben Griff zurückzunehmen, und ein Dialog vor jedem
 * Umlegen nähme dem Ding genau die Abkürzung, für die es da ist.
 */
export default function QuickSettingChip({
  userId,
  labelKey,
  field,
  value,
}: {
  userId: string;
  /** i18n-Schlüssel im `admin`-Namensraum (aus der Registratur). */
  labelKey: string;
  /** Das Feld, das `PATCH /api/admin/users/[id]` dafür entgegennimmt. */
  field: string;
  value: boolean;
}) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(userId);
  /**
   * Der eben gesetzte Wert, bis die Seite nachgezogen hat.
   *
   * `useUserSettingsSave` gibt den Knopf frei, sobald die Route geantwortet hat — das `router.
   * refresh()` daneben wird nicht abgewartet, und dessen Neuaufbau dieser Übersicht dauert länger
   * als der Patch. Ohne diesen Merker stünde der Chip in der Zwischenzeit wieder klickbar da und
   * zeigte den ALTEN Zustand: der zweite Tipp schickte dann denselben Wert noch einmal, und der
   * Schalter fühlte sich tot an. Der Dienst dahinter verwirft eine Nicht-Änderung, es entstünde
   * also kein Schaden — nur der Eindruck eines defekten Knopfes.
   */
  const [pending, setPending] = useState<boolean | null>(null);
  // Der Prop gewinnt, sobald er den gemerkten Wert eingeholt hat — und immer dann, wenn ihn jemand
  // ANDERS gesetzt hat (zweite Sitzung, MCP): der Merker soll den frischen Stand nicht überdauern.
  const shown = pending === null || pending === value ? value : pending;

  // `aria-disabled` statt `disabled`: ein abgeschalteter Knopf verlöre den Fokus an den
  // Dokumentanfang, während der Patch läuft. Die Schranke steht im Handler (siehe `busyDimCls`).
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-disabled={saving}
      onClick={() => {
        if (saving) return;
        const next = !shown;
        setPending(next);
        void save({ [field]: next }).then((ok) => { if (!ok) setPending(null); });
      }}
      className={[
        overviewChipCls,
        // Die AUF-FLÄCHE-Farbe (`ok-text`), nicht der Signalwert (`ok`): der Chip ist gefüllt.
        shown ? "text-ok-text border-ok-border bg-ok-bg" : "text-foreground-muted border-border-strong bg-surface",
        busyDimCls, "hover:opacity-80",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={["w-1.5 h-1.5 rounded-full", shown ? "bg-ok" : "bg-foreground-faint"].join(" ")}
      />
      {t(labelKey)}
      {/* Der Zustand gehört in die Ansage, nicht nur in Farbe und Punkt — `aria-pressed` allein
          liest sich je nach Screenreader als „gedrückt", und das ist für einen Schalter zu wenig. */}
      <span className="sr-only">{t(shown ? "quickStateOn" : "quickStateOff")}</span>
    </button>
  );
}
