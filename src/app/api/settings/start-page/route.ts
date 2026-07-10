import { isValidStartPage } from "@/lib/constants";
import { canControlSub } from "@/lib/keyholder";
import { userSelfFieldRoute } from "@/lib/userSelfField";

// Startseite nach Login ist ein USER-SELF-Feld (eigene Präferenz). Per CLAUDE.md brauchen nur
// admin-gesetzte Felder requireAdminApi() — normale Session-Auth ist hier korrekt.
export const PATCH = userSelfFieldRoute("startPage", async (startPage, session) => {
  // Gültig sind die festen Werte (auto/overview/users/dashboard) ODER die ID eines Subs, den der
  // eingeloggte Nutzer kontrolliert (dann landet er direkt auf dessen Detailseite).
  const role = session.user.role;
  const valid =
    isValidStartPage(startPage) ||
    (typeof startPage === "string" && (await canControlSub(session.user.id, role, startPage)));
  return valid ? null : "invalidStartPage";
});
