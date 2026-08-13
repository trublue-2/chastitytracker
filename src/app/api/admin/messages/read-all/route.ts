import { keyholderInboxRoutes } from "@/lib/messageInboxRoutes";

/** Quittiert wird nur IHR Gelesen-Stand: die geteilten Zeilen bleiben für die anderen Keyholder
 *  ungelesen. */
export const POST = keyholderInboxRoutes.readAll;
