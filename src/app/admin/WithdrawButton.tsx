"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { cardActionCls, iconActionCls } from "@/app/components/inputStyles";

interface Props {
  id: string;
  /** API base path, e.g. "/api/admin/kontrollen" */
  apiPath: string;
  /** Bereits übersetzte Beschriftung. BEWUSST kein i18n-Key: der Knopf wäre sonst auf den
   *  `admin`-Namespace festgelegt, und die Aufgaben-Texte liegen im `tasks`-Namespace — genau der
   *  Sonderfall, der sonst als zweite, konkurrierende Prop hätte danebengestellt werden müssen. */
  title: string;
  /** Beschriftung auch ANZEIGEN statt nur als Tooltip. In dichten Listenzeilen genügt das Kreuz; auf
   *  einer Karte ist ein 16-px-Icon ohne Wort keine erkennbare Aktion. */
  showLabel?: boolean;
  /** Semantic color token, e.g. "inspect" or "sperrzeit" */
  colorToken: "inspect" | "sperrzeit" | "orgasm" | "neutral";
  /** Rückfrage vor dem Rückzug (übersetzt); ohne Prop zieht der Knopf sofort zurück. Für das, was
   *  schon wirkt und nicht zurückzunehmen ist — nicht für Geplantes, das der Sub nicht kennt. */
  confirmMessage?: string;
  /** Der Sub hat die Direktive noch nicht gesehen (`isHiddenFromSub`): dann geht beim Rückzug
   *  keine Mitteilung an ihn, und die Rückfrage darf sie nicht versprechen. */
  hiddenFromSub?: boolean;
}

export default function WithdrawButton({ id, apiPath, title, showLabel, colorToken, confirmMessage, hiddenFromSub }: Props) {
  const tc = useTranslations("common");
  const ta = useTranslations("admin");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function withdraw() {
    setError("");
    const res = await run(`${apiPath}/${id}`, { action: "withdraw" });
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
    // Die Fehlerzeile steht neben dem Knopf, nicht im Dialog: der schliesst nach der Antwort.
    setConfirming(false);
  }

  return (
    <>
      <button
        onClick={confirmMessage ? () => setConfirming(true) : withdraw}
        disabled={saving}
        title={title}
        aria-label={showLabel ? undefined : title}
        className={showLabel
          ? cardActionCls(colorToken)
          : iconActionCls(colorToken)}
      >
        <X size={16} strokeWidth={2.5} />
        {showLabel && title}
      </button>
      {confirmMessage && (
        <ConfirmDialog
          open={confirming}
          title={title}
          message={hiddenFromSub ? confirmMessage : `${confirmMessage} ${ta("withdrawNotifiesSub")}`}
          confirmLabel={title}
          loading={saving}
          onConfirm={withdraw}
          onCancel={() => setConfirming(false)}
        />
      )}
      <FormError message={error} />
    </>
  );
}
