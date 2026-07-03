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
/** Feature flag: gate WEAR_BEGIN/WEAR_END entry creation + categories UI.
 *  Default ON. Setze `ENABLE_DEVICE_CATEGORIES=false` um KG-only-Verhalten zu erzwingen
 *  (z.B. fuer eine Instanz die das Feature noch nicht ausrollen will).
 *  Case-insensitive damit `False`/`FALSE` nicht still als ON durchrutschen. */
export function deviceCategoriesEnabled(): boolean {
  return process.env.ENABLE_DEVICE_CATEGORIES?.toLowerCase() !== "false";
}

/** Bildersafe (softwareseitige Schlüssel-Verwahrung: versiegeltes Foto des Schlüsselbox-Codes).
 *  Eigenständiges, opt-in Feature pro Instanz via `ENABLE_BILDERSAFE=true` (Default aus).
 *  Unabhängig von Heimdall (das über HEIMDALL_SYNC_SECRET aktiviert wird) — beide können
 *  einzeln aktiviert werden. Siegel + Kontrollen (Schicht A) sind davon unberührt. */
export function bildersafeEnabled(): boolean {
  return process.env.ENABLE_BILDERSAFE?.toLowerCase() === "true";
}

/** Max. Kantenlänge (px), auf die Bilder VOR einer Vision-Anfrage runterskaliert werden.
 *  Reduziert die Vision-Tokens/Latenz drastisch (v.a. lokale Modelle wie Ollama) bei kaum
 *  Genauigkeitsverlust für Ziffern/Geräte. Justierbar via `VISION_MAX_IMAGE_PX` (Default 1024). */
export function visionMaxImagePx(): number {
  const n = Number(process.env.VISION_MAX_IMAGE_PX);
  return Number.isFinite(n) && n >= 256 ? n : 1024;
}

/** Kleinere Kantenlänge für GERÄTE-Tasks (detect/check): dort zählen mehrere Bilder gleichzeitig,
 *  und die Geräte-Form ist auch bei weniger Auflösung erkennbar. Jedes Bild kostet Tokens ∝ px²,
 *  daher ist Verkleinern hier der größte Speed-Hebel. Env: VISION_DEVICE_MAX_IMAGE_PX (Default 768). */
export function visionDeviceMaxImagePx(): number {
  const n = Number(process.env.VISION_DEVICE_MAX_IMAGE_PX);
  return Number.isFinite(n) && n >= 256 ? n : 768;
}

/** Max. Referenzbilder JE Gerät im Vision-Prompt. Jedes Bild kostet ~1060 Tokens (~6s bei
 *  qwen2.5-vl auf M1) — das ist der dominante Latenz-Faktor, NICHT die Auflösung. Weniger Bilder =
 *  deutlich schneller; mehr = robustere Erkennung. Env: VISION_MAX_REFS_PER_DEVICE (Default 2). */
export function visionMaxRefsPerDevice(): number {
  const n = Number(process.env.VISION_MAX_REFS_PER_DEVICE);
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

/** Harte Obergrenze für die GESAMTzahl Referenzbilder im Geräte-Prompt (über alle Geräte), damit
 *  die Latenz bei vielen Geräten nicht explodiert. Env: VISION_MAX_TOTAL_REFS (Default 6). */
export function visionMaxTotalRefs(): number {
  const n = Number(process.env.VISION_MAX_TOTAL_REFS);
  return Number.isFinite(n) && n >= 1 ? n : 6;
}

/** Heimdall-Hardware-Box aktiv? = Sync-Secret gesetzt. Gilt für Integration UND Box-UI:
 *  ohne Secret werden keine Box-Aktionen angezeigt (auch wenn noch alte BoxStatus-Zeilen existieren). */
export function heimdallEnabled(): boolean {
  return !!process.env.HEIMDALL_SYNC_SECRET;
}
export const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"] as const;
/** Maps each ORGASMUS_ARTEN value to its orgasmForm i18n key (shared by entry + Anforderung forms). */
export const ORGASMUS_ART_I18N_KEYS: Record<string, string> = {
  "Orgasmus": "artOrgasmus",
  "ruinierter Orgasmus": "artRuiniert",
  "feuchter Traum": "artTraum",
};
/** Translates an orgasmusArt base value via the orgasmForm namespace, falling back to the raw value. */
export function orgasmusArtLabel(art: string, t: (key: string) => string): string {
  const key = ORGASMUS_ART_I18N_KEYS[art];
  return key ? t(key) : art;
}
/** Charakter einer Orgasmus-Aufforderung: ANWEISUNG = Pflicht, GELEGENHEIT = Erlaubnis. */
export const ORGASMUS_ANFORDERUNG_ARTEN = ["ANWEISUNG", "GELEGENHEIT"] as const;
export type OrgasmusAnforderungArt = typeof ORGASMUS_ANFORDERUNG_ARTEN[number];
/** Translates an OrgasmusAnforderung `art` (ANWEISUNG/GELEGENHEIT) via the admin namespace.
 *  Shared by the request form and the admin banners (overview + user detail) to avoid a
 *  duplicated ternary at each call site. */
export function orgasmusAnforderungArtLabel(art: OrgasmusAnforderungArt, t: (key: string) => string): string {
  return art === "ANWEISUNG" ? t("orgasmReqModeAnweisung") : t("orgasmReqModeGelegenheit");
}
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
  // Per-User gültige Reason-Codes (aus reasonsService). Fehlen sie, gelten die eingebauten Konstanten
  // (Default-Verhalten für null-Config / Aufrufer ohne User-Kontext) — unverändert.
  reasonCtx?: { orgasmCodes?: Set<string>; openingCodes?: Set<string> },
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
    const openingOk = reasonCtx?.openingCodes
      ? !!oeffnenGrund && reasonCtx.openingCodes.has(oeffnenGrund)
      : !!oeffnenGrund && OEFFNEN_GRUENDE.includes(oeffnenGrund as (typeof OEFFNEN_GRUENDE)[number]);
    if (!openingOk) {
      return { error: "Grund der Öffnung ist erforderlich", status: 400 };
    }
    if (!note?.trim()) return { error: "Kommentar ist erforderlich", status: 400 };
  }
  if (type === "PRUEFUNG" && requirePhotoForPruefung && !imageUrl) {
    return { error: "Foto ist bei Kontrolle zwingend", status: 400 };
  }
  const orgasmusArtBase = parseOrgasmusArtBase(orgasmusArt);
  if (type === "ORGASMUS") {
    const orgasmOk = reasonCtx?.orgasmCodes
      ? reasonCtx.orgasmCodes.has(orgasmusArtBase ?? "")
      : (ORGASMUS_ARTEN as readonly string[]).includes(orgasmusArtBase ?? "");
    if (!orgasmOk) return { error: "Ungültige Art", status: 400 };
  }
  return null;
}
