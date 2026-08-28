"use client";

import { RotateCw, SignalLow } from "lucide-react";
import { useTranslations } from "next-intl";
import { cardActionCls } from "@/app/components/inputStyles";

/**
 * „Verbindung stockt" — die eine Stelle, an der dieser Satz Gestalt annimmt.
 *
 * Er wird an zwei Orten gebraucht: in der Zustandszeile über dem Dashboard (`OfflineIndicator`) und
 * im (+)-Blatt, wo eine Seite nicht kommt. Beim ersten Bauen standen Zeichen, Fläche und Schlüssel
 * zweimal da — in EINEM Änderungssatz, also von Anfang an zum Auseinanderlaufen bestimmt.
 *
 * `onRetry` unterscheidet die beiden: die Zustandszeile stellt nur fest, das Blatt bietet den
 * zweiten Versuch an. Der Knopf nimmt `cardActionCls` und damit dessen `min-h-12` — eine
 * handgebaute Klassenkette hatte die Trefferfläche unter das AA-Minimum gedrückt, das
 * `iconButtonCls` gerade festschreibt.
 */
export default function PoorConnectionNote({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("offline");
  const tc = useTranslations("common");

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-warn-bg border border-warn-border text-warn-text"
      role="status"
      aria-live="polite"
    >
      <SignalLow size={16} className="shrink-0" aria-hidden />
      <span className="flex-1 min-w-0">{t("poorConnection")}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={cardActionCls("warn")}>
          <RotateCw size={14} aria-hidden />
          {tc("retry")}
        </button>
      )}
    </div>
  );
}
