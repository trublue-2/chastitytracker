"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import { parseDecimalInput, weightInputToKg, weightText, type UnitSystem } from "@/lib/weight";

/**
 * Das Drei-Punkte-Menü einer Wiege-Zeile: korrigieren und löschen.
 *
 * **Nur für die Keyholderin.** Dieselbe Trennung wie bei den Einträgen: der Träger korrigiert eigene
 * Zeilen nicht selbst, seine Liste bekommt diesen Slot deshalb gar nicht erst.
 *
 * Eigene Komponente statt `EntryActions` mit einem Schalter: die dortige Mechanik dreht sich um
 * `Entry` — Bearbeiten-Ziel, Ketten-Warnung beim Trennen eines Verschluss-Paares, ein zweiter
 * Modal-Schritt. Davon trifft auf eine Messung nichts zu; ein gemeinsames Bauteil müsste seine
 * halbe Logik wegschalten. Geteilt sind die STÜCKE (`RowActionsMenu`, `ActionModal`), und das ist
 * die richtige Ebene.
 */
export default function WeightRowActions({ id, label, weightKg, note, unitSystem, locale }: {
  id: string;
  /** Datum und Wert der Zeile — damit die Dialoge sagen, WELCHE Messung gemeint ist. */
  label: string;
  /** Der gespeicherte Wert in Kilogramm — Ausgangspunkt der Korrektur. */
  weightKg: number;
  note: string | null;
  /** Anzeige-Einheit DER KEYHOLDERIN: sie tippt die Korrektur, nicht er. */
  unitSystem: UnitSystem;
  locale: string;
}) {
  const t = useTranslations("weightList");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");

  /** Beim Öffnen frisch aus der Zeile befüllen — nicht beim Montieren: sonst zeigte der Dialog nach
   *  einem `router.refresh()` weiter den Stand von vorher. */
  function startEdit() {
    setWeight(weightText(weightKg, unitSystem, locale));
    setNoteDraft(note ?? "");
    setError("");
    setEditing(true);
  }

  async function saveEdit() {
    const parsed = parseDecimalInput(weight);
    if (parsed === null) { setError(t("editWeightMissing")); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/weight/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Kilogramm, wie überall im Feature: die Einheit ist eine Eigenschaft des Betrachters.
        body: JSON.stringify({ weightKg: weightInputToKg(parsed, unitSystem), note: noteDraft }),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  async function performDelete() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/weight/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setOpen(false);
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActionsMenu
        items={[
          { label: tc("edit"), icon: <Pencil size={14} />, onSelect: startEdit },
          { label: tc("delete"), icon: <Trash2 size={14} />, danger: true, onSelect: () => setOpen(true) },
        ]}
      />

      <ActionModal
        open={editing}
        onClose={() => setEditing(false)}
        title={t("editTitle")}
        icon={<Pencil size={20} style={{ color: "var(--color-foreground-muted)" }} />}
        iconBg="var(--color-surface-raised)"
      >
        {/* Der Zeitpunkt steht da, ist aber nicht änderbar: an ihm hängen Tagesschlüssel,
            Wiege-Fenster, Trend und die Freigabe-Rechnung. Wer den Tag falsch hat, löscht. */}
        <p className="text-sm text-foreground-faint">{label}</p>
        <div className="flex items-center gap-2">
          {/* Textfeld statt `type="number"`: Pfeilchen, Scroll-Verstellen und in manchen Browsern
              kein Komma — für „73,5" durchweg im Weg. */}
          <Input
            type="text"
            inputMode="decimal"
            autoFocus
            aria-label={t("weightLabel")}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-foreground-faint flex-shrink-0">{unitLabel}</span>
        </div>
        <Textarea
          label={tc("note")}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
        />
        <p className="text-xs text-foreground-faint">{t("editKeepsPhoto")}</p>
        <FormError message={error} />
        <Button fullWidth loading={saving} onClick={saveEdit}>{tc("save")}</Button>
        <Button variant="ghost" fullWidth onClick={() => setEditing(false)}>{tc("cancel")}</Button>
      </ActionModal>
      <ActionModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("deleteTitle")}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        iconBg="var(--color-warn-bg)"
      >
        {/* Die Messung beim Namen: in einer Liste gleichförmiger Zeilen ist „wirklich löschen?"
            ohne Datum und Wert eine Frage, die man nicht sicher beantworten kann. */}
        <p className="text-sm text-foreground-muted">{t("deleteConfirm", { entry: label })}</p>
        <FormError message={error} />
        <Button variant="danger" fullWidth loading={saving} icon={<Trash2 size={16} />} onClick={performDelete}>
          {tc("delete")}
        </Button>
        <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>{tc("cancel")}</Button>
      </ActionModal>
    </>
  );
}
