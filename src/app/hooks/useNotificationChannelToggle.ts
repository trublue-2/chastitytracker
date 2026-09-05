import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/app/hooks/useApiError";
import { saveOwnNotificationChannels } from "@/lib/apiClient";

type Channel = "mail" | "push" | "telegram";

/**
 * Ein Kanal-Schalter der eigenen Empfangs-Einstellungen (neue Nachrichten / Wiege-Erinnerung):
 * optimistisch setzen, NUR den einen Kanal schreiben (die Route aktualisiert selektiv, die anderen
 * bleiben), bei Fehler zurückrollen und melden.
 *
 * Geteilt von den drei Selbst-Schaltern (SettingsForm Mail/Push, WeightSettings, TelegramSettings) —
 * der EINZIGE Unterschied ist die Fehler-Fläche, die als `showError` hereinkommt: eine Inline-Card
 * (`setError`) oder ein Toast. `showError(null)` löscht eine frühere Meldung, `showError(text)` zeigt
 * eine. Auflösung des Fehler-Codes (`apiError`) und der generische Fallback (`common.error`) leben
 * hier an EINER Stelle — vorher rollte jede Kopie das selbst ab, eine davon abweichend.
 */
export function useNotificationChannelToggle(
  eventType: string,
  showError: (message: string | null) => void,
): (channel: Channel, setValue: (v: boolean) => void, checked: boolean) => Promise<void> {
  const tc = useTranslations("common");
  const apiError = useApiError();
  return useCallback(
    async (channel, setValue, checked) => {
      setValue(checked);
      showError(null);
      try {
        const code = await saveOwnNotificationChannels(eventType, { [channel]: checked });
        if (code) {
          setValue(!checked); // Rollback bei Fehler
          showError(apiError(code));
        }
      } catch {
        setValue(!checked);
        showError(tc("error"));
      }
    },
    [eventType, showError, apiError, tc],
  );
}
