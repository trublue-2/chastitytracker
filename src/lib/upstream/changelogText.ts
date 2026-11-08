/** A changelog entry's text: localized {de, en}, or a plain string for backwards compatibility
 *  with older upstream releases fetched from GitHub that may still use the pre-i18n shape. */
export type ChangelogText = string | { de: string; en?: string };

/** Picks the entry text for the given app locale, falling back to German. Defensive against
 *  malformed shapes: `UpstreamSection` renders unvalidated JSON fetched from another repo's
 *  `main` branch (the API route only checks `Array.isArray`, no per-entry schema check), so a
 *  missing/null/non-object `text` field must degrade to an empty string, not throw. */
export function pickChangelogText(text: ChangelogText | null | undefined, locale: string): string {
  if (text == null) return "";
  if (typeof text === "string") return text;
  if (typeof text !== "object") return String(text);
  return (locale === "en" ? text.en : text.de) ?? text.de ?? text.en ?? "";
}
