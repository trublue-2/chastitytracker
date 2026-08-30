"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";

/**
 * Die Rückfrage vor einem Passwortwechsel, der einen Strafbuch-Eintrag auslösen kann.
 *
 * **Gewarnt wird vor der NEBENWIRKUNG, nicht vor der Handlung** — ein Passwortwechsel ist gültig;
 * was ihn erklärungsbedürftig macht, ist die Zeile, die er in fremden Akten hinterlässt. Der Text
 * sagt das, deshalb steht er hier und nicht an den Aufrufstellen: Text, Zeichen und Warnfarbe
 * gehören zusammen, und sie standen in zwei Dateien Zeichen für Zeichen doppelt.
 *
 * Die Beschriftung des Knopfes bleibt beim Aufrufer, und zwar bewusst: die Selbstbedienung sagt
 * „Passwort ändern", die Keyholder-Sicht „Speichern". Beides ist richtig für seinen Ort, und ein
 * gemeinsamer Wert hätte einen der beiden still umbeschriftet.
 */
export default function PasswordChangeConfirm({
  open,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ts = useTranslations("settings");
  const ta = useTranslations("admin");

  return (
    <ConfirmDialog
      open={open}
      title={ts("changePassword")}
      message={ta("passwordChangeConfirmText")}
      confirmLabel={confirmLabel}
      icon={<KeyRound size={20} style={{ color: "var(--color-warn)" }} />}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
