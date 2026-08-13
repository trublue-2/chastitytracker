import { keyholderInboxRoutes } from "@/lib/messageInboxRoutes";

/** POST = gelesen, DELETE = wieder ungelesen. Das Kennzeichen trägt der LESER: quittiert ein
 *  Keyholder, bleibt die geteilte Zeile für die anderen ungelesen. */
export const POST = keyholderInboxRoutes.markRead;
export const DELETE = keyholderInboxRoutes.markUnread;
