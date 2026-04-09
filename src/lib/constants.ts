export const LOCALES = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
] as const;

export const LOCALES_LONG = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
] as const;

export const VALID_TYPES = ["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS"] as const;
export const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"] as const;
export const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"] as const;

/** Maps OEFFNEN_GRUENDE values to openForm i18n keys */
export const GRUND_I18N_KEYS: Record<typeof OEFFNEN_GRUENDE[number], string> = {
  REINIGUNG: "grundReinigung",
  KEYHOLDER: "grundKeyholder",
  NOTFALL: "grundNotfall",
  ANDERES: "grundAnderes",
};

// ── Entry display constants (shared by dashboard + admin entry lists) ─────────

export const TYPE_LABELS: Record<string, string> = {
  VERSCHLUSS: "Verschluss",
  OEFFNEN: "Öffnen",
  PRUEFUNG: "Kontrolle",
  ORGASMUS: "Orgasmus",
};

/** Maps entry type to stats i18n key (e.g. tStats(TYPE_STATS_KEYS["VERSCHLUSS"]) → "Lock") */
export const TYPE_STATS_KEYS: Record<string, string> = {
  VERSCHLUSS: "lock",
  OEFFNEN: "opening",
  PRUEFUNG: "inspection",
  ORGASMUS: "orgasm",
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
};

// ── Notification event types (shared by API + admin UI) ─────────────────────

export const NOTIFICATION_EVENT_TYPES = [
  "VERSCHLUSS",
  "OEFFNUNG_IMMER",
  "OEFFNUNG_VERBOTEN",
  "ORGASMUS",
  "KONTROLLE_FREIWILLIG",
  "KONTROLLE_ANGEFORDERT",
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

/** Validates that imageUrl is an internal upload path (prevents SSRF + ownership bypass). */
const ALLOWED_IMAGE_URL = /^\/api\/uploads\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined = no image, which is valid
  return ALLOWED_IMAGE_URL.test(url);
}
