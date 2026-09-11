import { useCallback } from "react";
import { useOptimisticSave } from "@/app/hooks/useOptimisticSave";
import { saveOwnNotificationChannels } from "@/lib/apiClient";
import type { NotifyChannel } from "@/lib/constants";

/**
 * Ein Kanal-Schalter eines EINZELNEN Ereignisses — seit dem Stufen-Modell nur noch die
 * Wiege-Erinnerung. Er schreibt NUR seinen Kanal (die Route aktualisiert selektiv), und er kann die
 * Stufe des Kanals nur verengen, nie erweitern (`notify.ts`).
 *
 * Optimistik, Rückrollen und Fehler-Anzeige kommen aus {@link useOptimisticSave}.
 */
export function useNotificationChannelToggle(
  eventType: string,
  showError: (message: string | null) => void,
): (channel: NotifyChannel, setValue: (v: boolean) => void, checked: boolean) => Promise<void> {
  const run = useOptimisticSave(showError);
  return useCallback(
    (channel, setValue, checked) => run(
      () => setValue(checked),
      () => setValue(!checked),
      () => saveOwnNotificationChannels(eventType, { [channel]: checked }),
    ),
    [run, eventType],
  );
}
