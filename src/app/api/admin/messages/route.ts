import { keyholderInboxRoutes } from "@/lib/messageInboxRoutes";

/** GET /api/admin/messages — eine Seite des Keyholder-Posteingangs. Der Zwilling von
 *  `GET /api/messages`, gleiche Antwort-Form; Unterschied ist allein der Scope
 *  (`messageInboxRoutes.ts`). */
export const GET = keyholderInboxRoutes.list;
