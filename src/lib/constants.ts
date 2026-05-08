export const LOCALES = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
] as const;

export const LOCALES_LONG = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
] as const;

export const VALID_TYPES = ["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS", "WEAR_BEGIN", "WEAR_END"] as const;
/** Entry types restricted to KG (the built-in DeviceCategory). */
export const KG_ENTRY_TYPES: ReadonlySet<string> = new Set(["VERSCHLUSS", "OEFFNEN"]);
/** Entry types for non-KG DeviceCategories (Plug, Collar, ...). Require deviceId. */
export const WEAR_ENTRY_TYPES: ReadonlySet<string> = new Set(["WEAR_BEGIN", "WEAR_END"]);
/** Feature flag: gate WEAR_BEGIN/WEAR_END entry creation + categories UI. */
export function deviceCategoriesEnabled(): boolean {
  return process.env.ENABLE_DEVICE_CATEGORIES === "true";
}
export const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"] as const;
export const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"] as const;
export type OeffnenGrund = typeof OEFFNEN_GRUENDE[number];

/** Maps OEFFNEN_GRUENDE values to openForm i18n keys */
export const GRUND_I18N_KEYS: Record<typeof OEFFNEN_GRUENDE[number], string> = {
  REINIGUNG: "grundReinigung",
  KEYHOLDER: "grundKeyholder",
  NOTFALL: "grundNotfall",
  ANDERES: "grundAnderes",
};

// ── Entry display constants (shared by dashboard + admin entry lists) ─────────

/** Maps entry type to stats i18n key (e.g. tStats(TYPE_STATS_KEYS["VERSCHLUSS"]) → "Lock") */
export const TYPE_STATS_KEYS: Record<string, string> = {
  VERSCHLUSS: "lock",
  OEFFNEN: "opening",
  PRUEFUNG: "inspection",
  ORGASMUS: "orgasm",
  WEAR_BEGIN: "wearBegin",
  WEAR_END: "wearEnd",
};

/** Hex colors for HTML email templates (no Tailwind/CSS vars available in email) */
export const TYPE_EMAIL_COLORS: Record<string, string> = {
  VERSCHLUSS: "#16a34a",
  OEFFNEN: "#dc2626",
  PRUEFUNG: "#f97316",
  ORGASMUS: "#8b5cf6",
};

export const TYPE_COLORS: Record<string, string> = {
  VERSCHLUSS: "text-foreground-muted",
  OEFFNEN: "text-foreground-muted",
  PRUEFUNG: "text-[var(--color-inspect)]",
  ORGASMUS: "text-[var(--color-orgasm)]",
  WEAR_BEGIN: "text-foreground-muted",
  WEAR_END: "text-foreground-muted",
};

// ── Notification event types (shared by API + admin UI) ─────────────────────

export const NOTIFICATION_EVENT_TYPES = [
  "VERSCHLUSS",
  "OEFFNUNG_IMMER",
  "OEFFNUNG_VERBOTEN",
  "ORGASMUS",
  "KONTROLLE_FREIWILLIG",
  "KONTROLLE_ANGEFORDERT",
  "WEAR_BEGIN_ANY",
  "WEAR_END_ANY",
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

// ── Password validation ─────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_MAX_BYTES = 72;

/** Returns error message string if invalid, null if OK */
export function validatePassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return `Passwort zu kurz (min. ${PASSWORD_MIN_LENGTH} Zeichen)`;
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) return `Passwort zu lang (max. ${BCRYPT_MAX_BYTES} Bytes)`;
  return null;
}

// ── Orgasmus Art parsing ────────────────────────────────────────────────────

/** Extracts base orgasmusArt before the " – " detail separator */
export function parseOrgasmusArtBase(orgasmusArt: string | null | undefined): string | undefined {
  return orgasmusArt?.split(" – ")[0];
}

// ── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return true; // null/empty = clear email, which is valid
  return EMAIL_RE.test(s);
}

// ── Device / KG constants ───────────────────────────────────────────────────

export const VALID_CURRENCIES = ["CHF", "EUR", "USD"] as const;
export type Currency = typeof VALID_CURRENCIES[number];

export const DEVICE_NAME_MAX_LENGTH = 60;
export const DEVICE_DESCRIPTION_MAX_LENGTH = 500;

// ── Rotation ────────────────────────────────────────────────────────────────

export const VALID_ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = typeof VALID_ROTATIONS[number];

/** Validates that imageUrl is an internal upload path (prevents SSRF + ownership bypass). */
const ALLOWED_IMAGE_URL = /^\/api\/uploads\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined = no image, which is valid
  return ALLOWED_IMAGE_URL.test(url);
}

/**
 * Shared payload validation for entry creation (used by both user and admin routes).
 * Returns { error, status } on failure, or null on success.
 * Note: Admin-route has `requirePhotoForPruefung: false` because admin may retroactively
 * log entries without a photo. User-route requires a photo for PRUEFUNG.
 */
export function validateEntryPayload(
  body: { type?: string; startTime?: string; imageUrl?: string; oeffnenGrund?: string; orgasmusArt?: string; note?: string },
  opts: { requirePhotoForPruefung?: boolean; allowFuture?: boolean } = {},
): { error: string; status: number } | null {
  const { requirePhotoForPruefung = true, allowFuture = false } = opts;
  const { type, startTime, imageUrl, oeffnenGrund, orgasmusArt, note } = body;

  if (!isValidImageUrl(imageUrl)) return { error: "Ungültige imageUrl", status: 400 };
  if (!startTime) return { error: "startTime is required", status: 400 };
  if (!allowFuture && new Date(startTime) > new Date()) return { error: "Zeitpunkt darf nicht in der Zukunft liegen", status: 400 };
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return { error: "Ungültiger Typ", status: 400 };
  }
  if (WEAR_ENTRY_TYPES.has(type) && !deviceCategoriesEnabled()) {
    return { error: "Device-Kategorien sind nicht aktiviert", status: 400 };
  }
  if (type === "OEFFNEN") {
    if (!oeffnenGrund || !OEFFNEN_GRUENDE.includes(oeffnenGrund as (typeof OEFFNEN_GRUENDE)[number])) {
      return { error: "Grund der Öffnung ist erforderlich", status: 400 };
    }
    if (!note?.trim()) return { error: "Kommentar ist erforderlich", status: 400 };
  }
  if (type === "PRUEFUNG" && requirePhotoForPruefung && !imageUrl) {
    return { error: "Foto ist bei Kontrolle zwingend", status: 400 };
  }
  const orgasmusArtBase = parseOrgasmusArtBase(orgasmusArt);
  if (type === "ORGASMUS" && !(ORGASMUS_ARTEN as readonly string[]).includes(orgasmusArtBase ?? "")) {
    return { error: "Ungültige Art", status: 400 };
  }
  return null;
}
