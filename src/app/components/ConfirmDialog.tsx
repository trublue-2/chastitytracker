"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";

/**
 * Rückfrage vor einer Aktion, die der Nutzer wahrscheinlich nicht so meint („Sicher ohne Foto?").
 * Reine Ja/Nein-Frage ohne eigenen Zustand — die Bestätigungen in `EntryActions` bleiben bewusst
 * eigenständig: die brauchen `danger`, `loading` und eine Fehlerzeile. Wächst dieser Bedarf hier,
 * ist das die Stelle, an der beide zusammenkommen.
 *
 * Bewusst KEIN natives `confirm()`: das steht ausserhalb des Design-Systems, sieht auf iOS in der
 * Capacitor-WebView fremd aus und lässt sich nicht beschriften.
 *
 * Der Bestätigen-Knopf ist NICHT `danger`: hier wird nichts gelöscht, sondern eine erlaubte Eingabe
 * bestätigt. Rot wäre eine Warnung vor der eigenen, gültigen Antwort.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  theme = "user",
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  theme?: "admin" | "user";
}) {
  const t = useTranslations("common");
  return (
    <ActionModal
      open={open}
      onClose={onCancel}
      title={title}
      icon={<AlertTriangle size={20} style={{ color: "var(--color-warn)" }} />}
      iconBg="var(--color-warn-bg)"
      theme={theme}
    >
      <p className="text-sm text-foreground-muted">{message}</p>
      <Button fullWidth onClick={onConfirm}>{confirmLabel}</Button>
      <Button variant="ghost" fullWidth onClick={onCancel}>{t("cancel")}</Button>
    </ActionModal>
  );
}
