"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { JOURNAL_VISIBILITIES, type JournalVisibility } from "@/lib/shared/constants";

/**
 * Die drei Sichtbarkeits-Stufen eines Tagebuch-Eintrags als Radiogruppe — unter jeder steht im
 * Klartext, was die Keyholderin dann sieht. Geteilt vom Sichtbarkeits-Blatt in der Liste und vom
 * Formular, damit beide dieselben Worte für dieselbe Entscheidung benutzen.
 */
export default function JournalVisibilityOptions({ value, onChange }: {
  value: JournalVisibility;
  onChange: (v: JournalVisibility) => void;
}) {
  const t = useTranslations("journal");
  const groupName = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t("visibilitySheetTitle")}</legend>
      {JOURNAL_VISIBILITIES.map((v) => (
        <label
          key={v}
          className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors hover:bg-surface-raised ${
            value === v ? "border-foreground" : "border-border"
          }`}
        >
          <input type="radio" name={groupName} value={v} checked={value === v} onChange={() => onChange(v)} className="mt-1" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{t(`vis${v}`)}</span>
            <span className="text-neben text-foreground-muted">{t(`visHint${v}`)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
