import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/app/hooks/useApiError";

/**
 * Eine Einstellung optimistisch umstellen: sofort anzeigen, schreiben, bei Fehler zurückrollen und
 * melden.
 *
 * Der Fehler-Vertrag steht damit an EINER Stelle — Auflösung des stabilen Codes (`apiError`) und der
 * generische Rückfall (`common.error`). Die beiden Aufrufer unterscheiden sich nur darin, WAS sie
 * schreiben und worauf sie zurückrollen: ein Kanal-Schalter auf `!checked`
 * ({@link useNotificationChannelToggle}), eine Kanal-Stufe auf den vorherigen Wert
 * ({@link useNotifyLevel}). Beides steckt in den beiden Rückrufen, nicht in einer zweiten Kopie.
 */
export function useOptimisticSave(
  showError: (message: string | null) => void,
): (apply: () => void, rollback: () => void, save: () => Promise<string | null>) => Promise<void> {
  const tc = useTranslations("common");
  const apiError = useApiError();
  return useCallback(
    async (apply, rollback, save) => {
      apply();
      showError(null);
      try {
        const code = await save();
        if (code) {
          rollback();
          showError(apiError(code));
        }
      } catch {
        rollback();
        showError(tc("error"));
      }
    },
    [showError, apiError, tc],
  );
}
