import { ownInboxRoutes } from "@/lib/messages/messageInboxRoutes";

/** POST = gelesen, DELETE = wieder ungelesen. */
export const POST = ownInboxRoutes.markRead;
export const DELETE = ownInboxRoutes.markUnread;
