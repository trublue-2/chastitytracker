"use client";

import { type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";

/**
 * Rückfrage vor einer Aktion, die der Nutzer wahrscheinlich nicht so meint („Sicher ohne Foto?") —
 * und vor einer, die er nicht zurücknehmen kann („Nachricht löschen?").
 *
 * `danger` + `loading` sind dazugekommen, als der Posteingang die dritte Rückfrage dieser Art
 * brauchte; genau dafür stand hier der Hinweis, dass beide dann zusammenkommen. Noch NICHT hier
 * liegt die Lösch-Kette aus `EntryActions`: die braucht zusätzlich eine Fehlerzeile im Dialog und
 * eine zweite Stufe (Kettenbruch) — solange dieser Bedarf einmalig ist, bleibt er dort.
 *
 * Bewusst KEIN natives `confirm()`: das steht ausserhalb des Design-Systems, sieht auf iOS in der
 * Capacitor-WebView fremd aus und lässt sich nicht beschriften.
 *
 * `danger` ist bewusst opt-in: wo eine erlaubte Eingabe bestätigt wird, wäre Rot eine Warnung vor
 * der eigenen, gültigen Antwort.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  loading = false,
  icon,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Zerstörende Aktion: roter Bestätigen-Knopf. */
  danger?: boolean;
  /** Läuft die Aktion noch (Netzabruf), zeigt der Knopf seinen Spinner. */
  loading?: boolean;
  /** Abweichendes Symbol; Default ist das Warndreieck. Die Farbe bleibt die Warnfarbe — eine
   *  Rückfrage ist immer ein Innehalten, egal welches Symbol darüber steht. */
  icon?: ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <ActionModal
      open={open}
      onClose={onCancel}
      title={title}
      icon={icon ?? <AlertTriangle size={20} style={{ color: "var(--color-warn)" }} />}
      iconBg="var(--color-warn-bg)"
    >
      <p className="text-sm text-foreground-muted">{message}</p>
      <Button variant={danger ? "danger" : "primary"} fullWidth loading={loading} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" fullWidth onClick={onCancel}>{t("cancel")}</Button>
    </ActionModal>
  );
}
