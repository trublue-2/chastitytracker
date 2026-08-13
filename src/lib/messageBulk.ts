import { MESSAGE_PAGE_SIZE } from "@/lib/messageService";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/**
 * Der Body von `POST …/messages/bulk` — geteilt vom Posteingang des Trägers und dem der
 * Keyholderin, weil die Prüfung in beiden dieselbe ist: die Ids sagen nur, WELCHE Zeilen gemeint
 * sind; wem sie gehören dürfen, entscheidet allein der Scope in der Route (Session bzw. Sub-Liste).
 *
 * Eigene Datei statt zweimal derselbe Block: die Obergrenze und die erlaubten Aktionen an zwei
 * Stellen zu pflegen, liefe beim ersten neuen Verb auseinander — und zwar still, weil eine Route
 * mit strengerer Grenze einfach seltener 400 antwortet.
 */

/** Wie viele Ids ein Aufruf höchstens trägt: eine Seite. Angekreuzt wird in der Liste, und die
 *  Auswahl fällt beim Blättern weg — mehr als eine Seite kann nur eine erfundene Anfrage sein.
 *  Aus der Seitengrösse abgeleitet statt danebengeschrieben. */
const MESSAGE_BULK_MAX_IDS = MESSAGE_PAGE_SIZE;

const MESSAGE_BULK_ACTIONS = ["delete", "read", "unread"] as const;
export type MessageBulkAction = (typeof MESSAGE_BULK_ACTIONS)[number];

export interface MessageBulkRequest {
  ids: string[];
  action: MessageBulkAction;
}

/** Prüft den Body und liefert ihn getypt — oder den Fehler-Code, den die Route ausgibt. */
export function parseMessageBulkBody(body: unknown): ServiceResult<MessageBulkRequest> {
  const { ids, action } = (body ?? {}) as { ids?: unknown; action?: unknown };
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MESSAGE_BULK_MAX_IDS ||
    ids.some((id) => typeof id !== "string")
  ) {
    return serviceFail(400, "MESSAGE_IDS_REQUIRED");
  }
  if (typeof action !== "string" || !(MESSAGE_BULK_ACTIONS as readonly string[]).includes(action)) {
    return serviceFail(400, "MESSAGE_ACTION_INVALID");
  }
  return { ok: true, data: { ids: ids as string[], action: action as MessageBulkAction } };
}
