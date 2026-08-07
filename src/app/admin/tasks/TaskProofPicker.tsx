"use client";

import { Camera, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import Input from "@/app/components/Input";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import { TASK_PROOF_MAX, TASK_PROOF_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import type { TaskProofInput } from "@/lib/taskService";

/**
 * Die geforderten Nachweis-Fotos einer Aufgabe zusammenstellen (Issue #39).
 *
 * Bewusst eine geordnete LISTE mit Hinzufügen/Entfernen — anders als die Bedingungen, die eine
 * feste Antipp-Liste sind. Der Grund ist der Inhalt: Bedingungen kommen aus einer bekannten Menge
 * (die Kategorien des Subs), ein Nachweis ist Freitext. Und die REIHENFOLGE ist hier kein
 * Darstellungsdetail, sondern die eigentliche Forderung — deshalb ist sie sichtbar nummeriert
 * statt bloss implizit durch die Zeilenfolge.
 */
export default function TaskProofPicker({
  value,
  onChange,
}: {
  value: TaskProofInput[];
  onChange: (next: TaskProofInput[]) => void;
}) {
  const t = useTranslations("tasks");

  const update = (i: number, patch: Partial<TaskProofInput>) =>
    onChange(value.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-foreground-faint">{t("proofsLabel")}</span>

      {value.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border-subtle overflow-hidden">
          {value.map((p, i) => (
            <div key={i} className="p-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                {/* Die Nummer trägt die Kernforderung: in DIESER Reihenfolge aufnehmen. */}
                <span
                  className="shrink-0 size-6 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums"
                  style={{ backgroundColor: "var(--color-inspect-bg)", color: "var(--color-inspect)" }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Input
                    value={p.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder={t("proofPlaceholder")}
                    maxLength={TASK_PROOF_DESCRIPTION_MAX_LENGTH}
                  />
                </div>
                <RemoveRowButton
                  onClick={() => onChange(value.filter((_, k) => k !== i))}
                  ariaLabel={t("proofRemove")}
                />
              </div>
              <div className="pl-8">
                <Checkbox
                  label={t("proofRequireCode")}
                  checked={p.requireCode ?? false}
                  onChange={(e) => update(i, { requireCode: e.target.checked })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {value.length < TASK_PROOF_MAX && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => onChange([...value, { description: "", requireCode: false }])}
        >
          {t("proofAdd")}
        </Button>
      )}

      <p className="text-xs text-foreground-faint flex items-start gap-1.5">
        <Camera size={13} className="shrink-0 mt-0.5" aria-hidden />
        <span>{t("proofsHint")}</span>
      </p>
    </div>
  );
}
