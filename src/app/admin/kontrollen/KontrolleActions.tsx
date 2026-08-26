"use client";

import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X, MinusCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import RowActionsMenu, { type RowAction } from "@/app/components/RowActionsMenu";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";

interface Props {
  kontrolleId: string | null;
  entryId: string | null;
  anforderungStatus: AnforderungStatus;
  verifikationStatus: VerifikationStatus | null;
}

export default function KontrolleActions({ kontrolleId, entryId, anforderungStatus, verifikationStatus }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const canWithdraw = !!kontrolleId && (anforderungStatus === "open" || anforderungStatus === "overdue" || anforderungStatus === "scheduled");
  const canDelete = !!kontrolleId && anforderungStatus === "withdrawn";
  const canManuallyVerify = !!entryId && verifikationStatus !== "manual" && verifikationStatus !== "ai";
  const canReject = !!entryId && verifikationStatus !== "rejected";

  const [error, setError] = useState<string | null>(null);

  /**
   * Rückfrage vor dem Ablehnen — die einzige Aktion dieses Menüs, die dem TRÄGER etwas antut.
   *
   * Die Regel, nach der sie hier steht und nicht anderswo: **eine Rückfrage gehört dorthin, wo eine
   * Handlung für einen ANDEREN Folgen hat — nicht nur dorthin, wo Daten verschwinden.** Der
   * Adminbereich hatte sie bis hierher genau umgekehrt verteilt: gefragt wurde vor dem Löschen von
   * Nutzer, Rolle und Vorgabe, also dort, wo Datensätze verschwinden, und nicht vor dem Ablehnen,
   * das dem Träger ein Vergehen einträgt. Wer die nächste Aktion dieser Art baut, misst sie an
   * dieser Regel und nicht an „ist hier etwas unwiederbringlich".
   *
   * Zurückziehen und Löschen bleiben bewusst ohne: das Zurückziehen NIMMT eine Forderung zurück, und
   * gelöscht werden kann nur eine bereits zurückgezogene Anforderung — beides entlastet den Träger,
   * statt ihn zu belasten.
   */
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  async function doAction(action: string) {
    setError(null);
    try {
      let res: Response | undefined;
      if (action === "delete" && kontrolleId) {
        res = await fetch(`/api/admin/kontrollen/${kontrolleId}`, { method: "DELETE" });
      } else if (action === "withdraw" && kontrolleId) {
        res = await fetch(`/api/admin/kontrollen/${kontrolleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "withdraw" }),
        });
      } else if ((action === "manuallyVerify" || action === "reject") && entryId) {
        // Am EINTRAG, nicht an der Anforderung: eine Selbstkontrolle hat keine (`kontrolleId` ist
        // dort null), und die Kontrollen-Route erreicht sie deshalb nicht. Für angeforderte
        // Kontrollen ist das Ergebnis dasselbe — die Route findet die Anforderung selbst.
        res = await fetch(`/api/admin/entries/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      }
      // Auffangnetz, kein aktiver Pfad: heute deckt sich jede Zweig-Bedingung oben mit dem `can…`,
      // das den zugehörigen Knopf zeigt. Driftet das je wieder auseinander — genau der Defekt vom
      // 07.08.2026 —, endet es ohne diesen Zweig in einem stillen `router.refresh()`: Knopf
      // gedrückt, nichts passiert, keine Meldung. Sichtbar scheitern ist besser.
      if (!res) {
        setError(apiError(null));
        return;
      }
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }
      router.refresh();
    } catch {
      setError(tc("networkError"));
    }
  }

  /**
   * Die Rückfrage schliesst hier AUCH im Fehlerfall — anders als im Posteingang, wo sie bewusst
   * stehen bleibt.
   *
   * Der Grund ist derselbe wie dort, nur mit umgekehrtem Ergebnis: massgeblich ist, wo die
   * Fehlerzeile steht. Im Posteingang liegt sie am Listenkopf, womöglich ausserhalb des Bildes —
   * ein geschlossener Dialog liesse den Nutzer vor einer unveränderten Liste ohne Grund zurück.
   * Hier steht sie direkt an der Zeile, deren Menü er gerade geöffnet hat. Offen zu bleiben hiesse
   * hingegen, sie unter dem Dialog zu verstecken: `ConfirmDialog` hat keinen Fehler-Slot, der Nutzer
   * sähe nur einen Knopf, der aufhört zu drehen, und nichts weiter.
   */
  async function runReject() {
    setRejecting(true);
    await doAction("reject");
    setRejecting(false);
    setConfirmReject(false);
  }

  /**
   * Die Einträge des Menüs. Über `RowActionsMenu`, nicht von Hand: hier stand der Zwilling dieser
   * Komponente — dieselbe gemessene `fixed`-Position, derselbe Aussen-Klick-Hänger, dieselbe
   * vierfach wiederholte Knopf-Zeile — nur ohne Escape, ohne `aria-haspopup`, ohne Schliessen beim
   * Scrollen und ohne Fokus-Rückgabe an den Auslöser. Letzteres war hier folgenreich: das Menü hängte
   * sich beim Ablehnen im selben Durchlauf aus, in dem die Rückfrage einzog, und der Fokus stand
   * beim Öffnen des Dialogs schon auf `<body>` — die Rückgabe lief also ins Leere. Das geteilte Menü
   * gibt den Fokus vor dem Auswählen an seinen Knopf zurück, und der Dialog findet ihn dort.
   */
  const items: RowAction[] = [
    canManuallyVerify && {
      label: t("kontrolleVerifyBtn"), icon: <CheckCircle2 size={14} />, ok: true,
      onSelect: () => doAction("manuallyVerify"),
    },
    canReject && {
      label: t("kontrolleRejectBtn"), icon: <X size={14} />, danger: true,
      onSelect: () => setConfirmReject(true),
    },
    canWithdraw && {
      label: t("kontrolleWithdrawBtn"), icon: <MinusCircle size={14} />,
      onSelect: () => doAction("withdraw"),
    },
    canDelete && {
      label: t("kontrolleDeleteBtn"), icon: <Trash2 size={14} />, danger: true,
      onSelect: () => doAction("delete"),
    },
  ].filter(Boolean) as RowAction[];

  if (items.length === 0) return null;

  return (
    <div className="relative flex-shrink-0">
      {error && (
        <p className="absolute right-0 top-full mt-1 text-xs text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-lg px-2 py-1 whitespace-nowrap z-50">{error}</p>
      )}
      <RowActionsMenu items={items} ariaLabel={t("kontrolleAriaActions")} />

      {/* Der Text richtet sich danach, ob überhaupt ein Vergehen entstehen kann — eine Rückfrage darf
          nicht mehr behaupten, als stimmt. Das Vergehen `rejected_control` leitet das Strafbuch aus
          den ANFORDERUNGEN ab (`kontrollAnforderungen.filter(k => k.entry?.verifikationStatus ===
          "rejected")`); eine freiwillige Selbstkontrolle hat keine — sie ist genau der Fall, in dem
          `kontrolleId` null ist. Ihre Ablehnung ist deshalb nur eine Meldung.

          Was auch die belastende Fassung nicht behauptet: dass das Vergehen sicher gezählt wird. Die
          Art ist je Sub abschaltbar (`OFFENSE_RULE_MODES.rejected_control`), und diese Komponente
          weiss davon nichts — der Vorbehalt steht deshalb im Satz statt in einer Bedingung, die hier
          gar nicht zu prüfen wäre. */}
      <ConfirmDialog
        open={confirmReject}
        title={t("kontrolleRejectConfirmTitle")}
        message={t(kontrolleId ? "kontrolleRejectConfirmTextRequested" : "kontrolleRejectConfirmTextVoluntary")}
        confirmLabel={t("kontrolleRejectBtn")}
        danger
        loading={rejecting}
        icon={<X size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={runReject}
        onCancel={() => setConfirmReject(false)}
      />
    </div>
  );
}
