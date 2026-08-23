"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";

/**
 * Das Drei-Punkte-Menü einer Wiege-Zeile — heute mit einem Eintrag: löschen.
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
export default function WeightRowActions({ id, label }: {
  id: string;
  /** Datum und Wert der Zeile — damit der Dialog sagt, WELCHE Messung verschwindet. */
  label: string;
}) {
  const t = useTranslations("weightList");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        items={[{ label: tc("delete"), icon: <Trash2 size={14} />, danger: true, onSelect: () => setOpen(true) }]}
      />
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
