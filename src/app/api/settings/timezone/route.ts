import { isValidTimezone } from "@/lib/timezones";
import { userSelfFieldRoute } from "@/lib/userSelfField";

// Timezone is a USER-SELF field (governs the user's own display/input). Per CLAUDE.md only
// admin-set fields need requireAdminApi() — normal session auth is correct here.
export const PATCH = userSelfFieldRoute("timezone", (v) => (isValidTimezone(v) ? null : "invalidTimezone"));
