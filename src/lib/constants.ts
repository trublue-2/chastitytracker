export const VALID_TYPES = ["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS"] as const;
export const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"] as const;
export const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"] as const;

// ── Entry display constants (shared by dashboard + admin entry lists) ─────────

export const TYPE_LABELS: Record<string, string> = {
  VERSCHLUSS: "Verschluss",
  OEFFNEN: "Öffnen",
  PRUEFUNG: "Prüfung",
  ORGASMUS: "Orgasmus",
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

// ── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return true; // null/empty = clear email, which is valid
  return EMAIL_RE.test(s);
}

/** Validates that imageUrl is an internal upload path (prevents SSRF + ownership bypass). */
const ALLOWED_IMAGE_URL = /^\/api\/uploads\/[a-zA-Z0-9._-]+$/;
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined = no image, which is valid
  return ALLOWED_IMAGE_URL.test(url);
}
