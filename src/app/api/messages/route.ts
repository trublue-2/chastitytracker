import { ownInboxRoutes } from "@/lib/messageInboxRoutes";

/** GET /api/messages — eine Seite des eigenen Posteingangs. Vertrag und Begründungen stehen in
 *  `messageInboxRoutes.ts`; der Keyholder-Zwilling liegt unter `/api/admin/messages`. */
export const GET = ownInboxRoutes.list;
