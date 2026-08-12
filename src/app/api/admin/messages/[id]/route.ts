import { keyholderInboxRoutes } from "@/lib/messageInboxRoutes";

/** ACHTUNG: die Keyholder-Zeile ist EINE Zeile je Träger für ALLE seine Keyholder; wer löscht,
 *  löscht sie für die anderen mit (siehe `deleteMessages` in `messageService.ts`). */
export const DELETE = keyholderInboxRoutes.remove;
