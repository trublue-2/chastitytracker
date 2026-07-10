import { userSelfFieldRoute } from "@/lib/userSelfField";

// „Eigene Karte in der Keyholder-Übersicht ausblenden" ist ein USER-SELF-Feld (eigene Präferenz).
// Per CLAUDE.md brauchen nur admin-gesetzte Felder requireAdminApi() — Session-Auth ist hier korrekt.
export const PATCH = userSelfFieldRoute("hideOwnTracker", (v) =>
  typeof v === "boolean" ? null : "invalidHideOwnTracker",
);
