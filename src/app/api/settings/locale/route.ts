import { isValidLocale } from "@/lib/constants";
import { userSelfFieldRoute } from "@/lib/userSelfField";

// Locale is a USER-SELF field (the user's own UI + notification language). Per CLAUDE.md only
// admin-set fields need requireAdminApi() — normal session auth is correct here.
export const PATCH = userSelfFieldRoute("locale", (v) => (isValidLocale(v) ? null : "invalidLocale"));
