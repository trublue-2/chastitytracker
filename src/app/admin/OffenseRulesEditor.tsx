"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import Select from "@/app/components/Select";
import SettingLabel from "@/app/components/SettingLabel";
import { useSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { OFFENSE_MODE_I18N_KEYS, OFFENSE_TYPE_I18N_KEYS } from "@/lib/offenseLabels";
import { OFFENSE_RULE_MODES, type OffenseMode, type SwitchableOffenseType } from "@/lib/offenseRules";

/**
 * Der Abschnitt, in dem die PARAMETER dieser Art stehen (Grenze, Frist, Fenster). Die Zeile hier
 * schaltet die Art nur an oder aus und verweist auf ihn — dieselbe Zahl an zwei Orten anzubieten
 * heisst, dass sie irgendwann an zwei Orten verschieden ist.
 *
 * Bewusst hier und nicht in `offenseLabels.ts`: die Werte sind Abschnitts-Schlüssel DIESER Seite,
 * also Wissen über ihren Aufbau — eine Bibliothek, die es kennt, müsste bei jedem Umbau der Seite
 * mitgeändert werden.
 */
const PARAM_SECTION_KEY: Partial<Record<SwitchableOffenseType, string>> = {
  cleaning_limit: "sectionReinigung",
  cleaning_not_relocked: "sectionReinigung",
  late_control: "sectionAutoKontrolle",
  auto_removed_control: "sectionInspectionEscalation",
};

/** Ein Schalter genügt nur, wenn der Vorrat GENAU `off`/`on` ist. An der Anzahl gemessen bekäme ein
 *  künftiges `["off", "lockedOnly"]` einen Schalter, der dauerhaft „aus" zeigt und beim Klick `on`
 *  schickt — also eine Absage vom Server. Am Wortlaut gemessen bekommt es die Auswahl. */
const isBinary = (modes: readonly OffenseMode[]): boolean =>
  modes.length === 2 && modes[0] === "off" && modes[1] === "on";

export default function OffenseRulesEditor({
  userId,
  types,
  initialRules,
}: {
  userId: string;
  /** Die Arten, die bei DIESEM Sub gelten — `switchableOffenseTypesFor()`, auf dem Server gebildet.
   *  Die Reihenfolge ist die der Liste; gefiltert wird nicht hier, damit die Lese-Seite des Trägers
   *  dieselbe Auswahl zeigt. */
  types: readonly SwitchableOffenseType[];
  initialRules: Record<SwitchableOffenseType, OffenseMode>;
}) {
  const t = useTranslations("admin");
  const tOffense = useTranslations("offenses");
  // Kein `router.refresh()` nach dem eigenen Speichern: der Stand steht schon in `rules`, und ein
  // Neurendern der Seite würde den frischen Prop-Wert gar nicht übernehmen. Fremde Refreshes fängt
  // der Abgleich darunter ab.
  const { saving, save } = useSettingsSave("/api/admin/offense-rules", { refresh: false });
  const [rules, setRules] = useState(initialRules);

  // Die Nachbar-Sektion kann diese Liste ändern: schaltet die Keyholderin das Gewichtstracking ab,
  // legt der Server `missed_weight_report` mit auf `off` und die Zeile verschwindet. Ohne diesen
  // Abgleich käme sie beim Wiedereinschalten mit dem alten lokalen „an" zurück und behauptete eine
  // Regel, die es nicht mehr gibt. Verglichen wird der INHALT: der Prop ist bei jedem Server-Render
  // ein neues Array, und an seiner Identität gemessen würde jeder Refresh die Anzeige zurücksetzen.
  const signature = types.join(",");
  const [shownSignature, setShownSignature] = useState(signature);
  if (shownSignature !== signature) {
    setShownSignature(signature);
    setRules(initialRules);
  }

  /** Sofort umlegen, bei Ablehnung zurück: ein Schalter, der erst nach der Antwort springt, wirkt
   *  kaputt — einer, der springt und beim Fehler stehen bleibt, LÜGT. */
  async function setMode(type: SwitchableOffenseType, mode: OffenseMode) {
    const previous = rules[type];
    if (previous === mode) return;
    setRules((r) => ({ ...r, [type]: mode }));
    const ok = await save({ userId, offenseType: type, mode });
    if (!ok) setRules((r) => ({ ...r, [type]: previous }));
  }

  return (
    <div className="flex flex-col gap-3">
      {types.map((type) => {
        const key = OFFENSE_TYPE_I18N_KEYS[type];
        const name = tOffense(`${key}.name`);
        const sectionKey = PARAM_SECTION_KEY[type];
        const description = sectionKey
          ? `${tOffense(`${key}.desc`)} ${t("offenseRuleParamHint", { section: t(sectionKey) })}`
          : tOffense(`${key}.desc`);
        const modes: readonly OffenseMode[] = OFFENSE_RULE_MODES[type];

        if (isBinary(modes)) {
          return (
            <Toggle
              key={type}
              label={name}
              description={description}
              checked={rules[type] === "on"}
              disabled={saving}
              onChange={(checked) => setMode(type, checked ? "on" : "off")}
            />
          );
        }

        return (
          <div key={type} className="flex flex-col gap-1.5 py-1">
            <SettingLabel label={name} description={description} />
            <Select
              value={rules[type]}
              disabled={saving}
              aria-label={name}
              options={modes.map((m) => ({ value: m, label: t(OFFENSE_MODE_I18N_KEYS[m]) }))}
              onChange={(e) => setMode(type, e.target.value as OffenseMode)}
            />
          </div>
        );
      })}
    </div>
  );
}
