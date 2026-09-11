import { useCallback } from "react";
import { useOptimisticSave } from "@/app/hooks/useOptimisticSave";
import { saveNotifyLevel } from "@/lib/apiClient";
import type { NotifyChannel, NotifyLevel } from "@/lib/constants";

/**
 * Eine Kanal-Stufe der eigenen Einstellungen umstellen — der eine Kanal wird geschrieben, die
 * übrigen bleiben. Optimistik, Rückrollen und Fehler-Anzeige kommen aus
 * {@link useOptimisticSave}; hier steht nur, was gespeichert wird und worauf zurückgerollt wird.
 */
export function useNotifyLevel(
  apply: (channel: NotifyChannel, level: NotifyLevel) => void,
  showError: (message: string | null) => void,
): (channel: NotifyChannel, level: NotifyLevel, previous: NotifyLevel) => Promise<void> {
  const run = useOptimisticSave(showError);
  return useCallback(
    (channel, level, previous) => run(
      () => apply(channel, level),
      () => apply(channel, previous),
      () => saveNotifyLevel(channel, level),
    ),
    [run, apply],
  );
}
