"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import FormError from "@/app/components/FormError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
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
}

export default function WithdrawButton({ id, apiPath, title, showLabel, colorToken }: Props) {
  const tc = useTranslations("common");
  const { saving, run } = useActionPatch();
  const [error, setError] = useState("");

  async function handle() {
    setError("");
    const res = await run(`${apiPath}/${id}`, { action: "withdraw" });
    // Bewusst allgemein: an dieser Stelle steht kein Platz für einen aufgelösten Fehler-Code, und
    // der Rückzug hat auch keine, die der Nutzer unterscheiden könnte.
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(tc("savingError"));
  }

  return (
    <>
      <button
        onClick={handle}
        disabled={saving}
        title={title}
        className={showLabel
          ? cardActionCls(colorToken)
          : iconActionCls(colorToken)}
      >
        <X size={16} strokeWidth={2.5} />
        {showLabel && title}
      </button>
      <FormError message={error} />
    </>
  );
}
