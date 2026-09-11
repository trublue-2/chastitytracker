import type { MessageBodyKey } from "@/lib/messageService";

/**
 * Vorgaben für Platzhalter, die eine Meldung erst später bekommen hat — angewandt, wo aus Schlüssel
 * und Parametern Text wird: in der Posteingangs-Anzeige (`messagePresenter`) und beim Versand
 * (`notify.ts`).
 *
 * Ältere Posteingangs-Zeilen tragen den neuen Parameter nicht, und ein Platzhalter ohne Wert bricht
 * beim Rendern. Mit der Vorgabe lesen sie sich genau wie vorher: die Aufgaben-Meldungen nennen ihre
 * Nachweise über `{proofCount, plural, =0 {} …}`, und 0 lässt den Satz weg. Das hält EINEN Text je
 * Meldung, statt jede Fassung mit und ohne Zusatz doppelt zu führen.
 */
const DEFAULTS: Partial<Record<MessageBodyKey, Record<string, string | number>>> = {
  taskAssignedMessage: { proofCount: 0 },
  taskAssignedDurationMessage: { proofCount: 0 },
  taskChangedMessage: { proofCount: 0 },
  taskChangedDurationMessage: { proofCount: 0 },
  penaltyTaskMessage: { proofCount: 0 },
  penaltyTaskDurationMessage: { proofCount: 0 },
};

export function withMessageDefaults(
  key: string,
  params: Record<string, string | number> | null | undefined,
): Record<string, string | number> | undefined {
  const defaults = DEFAULTS[key as MessageBodyKey];
  return defaults ? { ...defaults, ...params } : params ?? undefined;
}
