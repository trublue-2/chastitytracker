import type { EntryValidationCode } from "@/lib/entryErrors";

export const VALID_LOCALES = ["de", "en"] as const;
export type Locale = (typeof VALID_LOCALES)[number];
/** Single source for locale validation — shared by i18n/request.ts, the settings API and the sync. */
export function isValidLocale(v: unknown): v is Locale {
  return typeof v === "string" && (VALID_LOCALES as readonly string[]).includes(v);
}

/** Clamp any value to a valid locale, falling back to "de" (the default). */
export function toLocale(v: unknown): Locale {
  return isValidLocale(v) ? v : "de";
}

/** Public marketing site — hosts the user-facing how-to / FAQ content linked from the app. */
export const MARKETING_URL = "https://chastitytracker.ch";
/** Locale-aware link to the public inspection explanation (marketing FAQ; EN lives under /en). */
export function inspectionHelpUrl(locale: string): string {
  return locale === "en" ? `${MARKETING_URL}/en/faq` : `${MARKETING_URL}/faq`;
}

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
// AUTO_ENTFERNT: system-only reason for the auto-created OEFFNEN entry when a Kontrolle's
// escalation reminder is ignored (see inspectionEscalationService.ts). Protected like REINIGUNG
// (reservedCodes() covers all of OEFFNEN_GRUENDE), but unlike REINIGUNG it must never be
// user-selectable — see SYSTEM_ONLY_OPENING_CODES below, filtered out of the sub's own dropdown.
export const AUTO_ENTFERNT_REASON = "AUTO_ENTFERNT";
export const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES", AUTO_ENTFERNT_REASON] as const;
export type OeffnenGrund = typeof OEFFNEN_GRUENDE[number];
/** Reserved AND hidden from the user-facing opening-reason picker — system-only codes. */
export const SYSTEM_ONLY_OPENING_CODES: readonly string[] = [AUTO_ENTFERNT_REASON];

/** Wer einen Eintrag verursacht hat. `system` = niemand hat gehandelt, der Tracker hat gebucht
 *  (Eskalation einer unbeantworteten Kontrolle). Spiegelt die `Entry.source`-Spalte; die Regel
 *  „nur eine WILLENTLICHE Handlung hat Folgen" hängt daran (Strafbuch, Sperrzeit-Bruch). */
export const ENTRY_SOURCES = ["user", "system"] as const;
export type EntrySource = typeof ENTRY_SOURCES[number];

/**
 * Warum eine VerschlussAnforderung/Sperrzeit `withdrawnAt` trägt — die Endart, nicht nur das Ende.
 *
 * Ohne sie sah eine vom Sub aufgebrochene Sperrzeit exakt aus wie eine bewusst zurückgezogene und
 * wie eine, die es nie gab: `withdrawnAt` gesetzt, sonst nichts. Genau diese Ununterscheidbarkeit
 * war der Bug (11.07.2026 — eine 14-Tage-Sperre verschwand spurlos).
 *
 * `null` heisst „noch nicht beendet" ODER „vor v4.50.30 beendet" — Alt-Zeilen tragen keinen Grund.
 */
export const LOCK_ENDED_REASON = {
  /** Bewusst zurückgezogen (Keyholder-Aktion oder von einer neuen Direktive ersetzt). */
  keyholder: "keyholder",
  /** Durch eine Öffnung des Subs beendet. Ob diese Öffnung ERLAUBT war, sagt das Strafbuch —
   *  hier steht nur, WIE die Sperrzeit endete, nicht ob jemand sich etwas zuschulden kommen liess. */
  opening: "opening",
  /** Vom Poller verworfen, weil sie im Moment ihrer Auslösung schon gegenstandslos war. */
  obsolete: "obsolete",
} as const;
export type LockEndedReason = typeof LOCK_ENDED_REASON[keyof typeof LOCK_ENDED_REASON];

/** Maps OEFFNEN_GRUENDE values to openForm i18n keys */
export const GRUND_I18N_KEYS: Record<typeof OEFFNEN_GRUENDE[number], string> = {
  REINIGUNG: "grundReinigung",
  KEYHOLDER: "grundKeyholder",
  NOTFALL: "grundNotfall",
  ANDERES: "grundAnderes",
  AUTO_ENTFERNT: "grundAutoEntfernt",
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

/** User-Spalten, die ein Nutzer über den generischen `userSelfFieldRoute`-Handler SELBST ändern
 *  darf. Bewusst eng gehalten und compilerseitig erzwungen: admin-gesetzte Felder (`role`,
 *  `reinigungErlaubt`, `mobileDesktopUpload`, …) gehören NICHT hierher — die brauchen laut
 *  CLAUDE.md („Admin-Felder in User-Settings") zwingend `requireAdminApi()`.
 *  `email`/`passwordHash` sind ebenfalls Self-Felder, laufen aber über eigene Handler
 *  (Trim/409 bzw. anderer Body-Key + bcrypt) und stehen deshalb nicht in dieser Liste. */
export const SELF_EDITABLE_USER_FIELDS = ["timezone", "locale", "hideOwnTracker", "startPage"] as const;
export type SelfEditableUserField = (typeof SELF_EDITABLE_USER_FIELDS)[number];

/** Stabiler Fehler-Code der Settings-Services, wenn ein Patch kein einziges Feld setzt. Geteilt von
 *  setReinigungSettings / setAutoKontrolleSettings / setInspectionEscalationSettings, damit die
 *  drei Geschwister nicht auseinanderlaufen. Der Client löst ihn über den `errors`-Namespace auf. */
export const NO_FIELDS_TO_UPDATE = "noFieldsToUpdate";

/** Stabiler Fehler-Code für ein Feld, das keine gültige „HH:MM"-Uhrzeit ist. */
export const INVALID_TIME = "invalidTime";

/** Call-to-Action-Button-Farben für HTML-Mails (in E-Mail keine CSS-Variablen → Hex).
 *  Bewusst getrennt von TYPE_EMAIL_COLORS: das ist der Akzent je Eintrags-TYP, nicht die
 *  Button-Farbe eines Benachrichtigungs-Mails (eine Orgasmus-ANWEISUNG ist kein Orgasmus-Eintrag). */
export const EMAIL_BUTTON_COLORS = {
  /** Standard: Dashboard-Button. */
  default: "#4f46e5",
  /** Kontroll-Anforderung („Kontrolle erfüllen"). */
  inspection: "#f97316",
  /** Orgasmus-Anweisung / -Gelegenheit. */
  orgasm: "#be185d",
} as const;

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

// ── Trainingsvorgabe: Perioden-Stundenbasis (nur für h↔% Umrechnung im Admin-Formular) ──
// Durchschnittswerte; Monat = 365.25/12·24, Jahr = 365.25·24 (berücksichtigt Schaltjahre).
export const HOURS_PER_DAY = 24;
export const HOURS_PER_WEEK = 168;
export const HOURS_PER_MONTH = 730;
export const HOURS_PER_YEAR = 8766;

// ── Startseite nach Login (pro-User-Präferenz) ───────────────────────────────
export const START_PAGES = ["auto", "overview", "users", "dashboard"] as const;
export type StartPage = (typeof START_PAGES)[number];
export function isValidStartPage(v: unknown): v is StartPage {
  return typeof v === "string" && (START_PAGES as readonly string[]).includes(v);
}

// ── Password validation ─────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_MAX_BYTES = 72;

export type PasswordErrorCode = "passwordTooShort" | "passwordTooLong";

/** Returns a stable i18n error code if invalid, null if OK. */
export function passwordErrorCode(password: string): PasswordErrorCode | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return "passwordTooShort";
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) return "passwordTooLong";
  return null;
}

// ── Orgasmus Art parsing ────────────────────────────────────────────────────

/** Kanonisches Trennzeichen zwischen Hauptart und Unterart einer Orgasmus-Art (Single Source). */
export const ART_SEP = " – ";

/** Extracts base orgasmusArt before the ART_SEP detail separator */
export function parseOrgasmusArtBase(orgasmusArt: string | null | undefined): string | undefined {
  return orgasmusArt?.split(ART_SEP)[0];
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
 * Returns a stable error code on failure (always a 400 for the caller), or null on success.
 * The route answers with `{ error: code }`; the client resolves it via `useApiError()`.
 * Note: Admin-route has `requirePhotoForPruefung: false` because admin may retroactively
 * log entries without a photo. User-route requires a photo for PRUEFUNG.
 */
export function validateEntryPayload(
  body: { type?: string; startTime?: string; imageUrl?: string; oeffnenGrund?: string; orgasmusArt?: string; note?: string },
  opts: { requirePhotoForPruefung?: boolean; allowFuture?: boolean } = {},
  // Per-User Reason-Validierung (aus reasonsService). Fehlt sie, gelten die eingebauten Konstanten
  // (Default-Verhalten für null-Config / Aufrufer ohne User-Kontext) — unverändert. `orgasmAllowed`
  // prüft den VOLLEN Wert (Kombi-Code ODER blanke Hauptart), nicht nur die Basis.
  reasonCtx?: { orgasmAllowed?: (value: string) => boolean; openingCodes?: Set<string> },
): EntryValidationCode | null {
  const { requirePhotoForPruefung = true, allowFuture = false } = opts;
  const { type, startTime, imageUrl, oeffnenGrund, orgasmusArt, note } = body;

  if (!isValidImageUrl(imageUrl)) return "INVALID_IMAGE_URL";
  if (!startTime) return "START_TIME_REQUIRED";
  if (!allowFuture && new Date(startTime) > new Date()) return "TIME_IN_FUTURE";
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return "INVALID_TYPE";
  }
  if (WEAR_ENTRY_TYPES.has(type) && !deviceCategoriesEnabled()) {
    return "DEVICE_CATEGORIES_DISABLED";
  }
  if (type === "OEFFNEN") {
    // System-only reason codes (e.g. AUTO_ENTFERNT) are reserved/protected like REINIGUNG, but
    // must NEVER be user-submittable — otherwise a sub could pick the "auto-marked" label
    // themselves via a hand-crafted request, even though `source` (system vs. user) is never
    // client-controlled. Block unconditionally, before the openingCodes/OEFFNEN_GRUENDE check.
    if (oeffnenGrund && SYSTEM_ONLY_OPENING_CODES.includes(oeffnenGrund)) {
      return "OPENING_REASON_REQUIRED";
    }
    const openingOk = reasonCtx?.openingCodes
      ? !!oeffnenGrund && reasonCtx.openingCodes.has(oeffnenGrund)
      : !!oeffnenGrund && OEFFNEN_GRUENDE.includes(oeffnenGrund as (typeof OEFFNEN_GRUENDE)[number]);
    if (!openingOk) {
      return "OPENING_REASON_REQUIRED";
    }
    if (!note?.trim()) return "NOTE_REQUIRED";
  }
  if (type === "PRUEFUNG" && requirePhotoForPruefung && !imageUrl) {
    return "INSPECTION_PHOTO_REQUIRED";
  }
  if (type === "ORGASMUS") {
    const orgasmOk = reasonCtx?.orgasmAllowed
      ? reasonCtx.orgasmAllowed(orgasmusArt ?? "")
      : (ORGASMUS_ARTEN as readonly string[]).includes(parseOrgasmusArtBase(orgasmusArt) ?? "");
    if (!orgasmOk) return "INVALID_ORGASM_TYPE";
  }
  return null;
}
