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
 * der eigenen, gültigen Antwort. Eine Nebenwirkung im Meldungstext ist ausdrücklich VORGESEHEN und
 * kein Grund, zu {@link RiskConfirmSheet} zu wechseln — dort geht es um Rückfragen, bei denen das
 * Zurücktreten die wahrscheinlichere richtige Antwort ist (siehe dessen Doku).
 *
 * **Wann `loading` mitgegeben wird — die Regel gilt für alle Aufrufstellen, statt sie je Stelle neu
 * herzuleiten:** Zeigt der Aufrufer seine Fehlerzeile IM Blickfeld der Rückfrage (Formular, Karte
 * direkt darunter), schliesst er den Dialog vor dem Abruf und braucht kein `loading`. Steht die
 * Fehlerzeile weiter weg (Listenkopf, eigener Bereich), bleibt der Dialog bis nach der Antwort
 * offen und bekommt `loading` — sonst verschwindet die Rückfrage und der Fehler erscheint
 * ausserhalb des Blicks.
 *
 * `loading` reicht als `busy` an den Dialog weiter: solange die Aktion läuft, schliesst weder
 * Escape noch Abbrechen noch das X. Ein Escape mitten in der Anfrage nähme dem Nutzer sonst die Rückfrage weg, während im
 * Hintergrund weitergelöscht wird — er sähe eine unveränderte Seite und hielte den Abbruch für
 * gelungen.
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
      busy={loading}
      title={title}
      icon={icon ?? <AlertTriangle size={20} style={{ color: "var(--color-warn)" }} />}
      iconBg="var(--color-warn-bg)"
    >
      <p className="text-sm text-foreground-muted">{message}</p>
      <Button variant={danger ? "danger" : "primary"} fullWidth loading={loading} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      {/* Bei laufender Anfrage tot. `busy` sperrte bisher nur Escape — Abbrechen und das X in der
          Kopfzeile blieben bedienbar und schlossen die Rückfrage, während die Aktion weiterlief.
          Genau das Missverständnis, das der Hinweis oben verhindern will: der Nutzer hält den
          Abbruch für gelungen, und im Hintergrund wird trotzdem gelöscht. */}
      <Button variant="ghost" fullWidth disabled={loading} onClick={onCancel}>{t("cancel")}</Button>
    </ActionModal>
  );
}
