import { createTranslator } from "next-intl";
import { escHtml } from "@/lib/mail";
import { toLocale, type Locale } from "@/lib/constants";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

// Loosely typed on purpose: subjectKey/messageKey in NotifyContent are dynamic strings, so the
// translator must accept `string` keys (as the previously-used getTranslations did). Runtime key
// validation is handled by createTranslator itself.
type LooseMessages = Record<string, Record<string, string>>;
const MESSAGES = { de, en } as unknown as Record<Locale, LooseMessages>;

/**
 * Translator for the `emails` namespace in a given language. All e-mails and push notifications are
 * rendered in the RECIPIENT's stored language (User.locale) — never the sender's browser cookie.
 * Built with `createTranslator` (not `getTranslations`) so it works OUTSIDE a request scope too:
 * the background poller sends inspection/lock notifications from a `setInterval`, where the
 * request-scoped `getTranslations`/`cookies()` would throw. The caller passes the recipient's
 * `locale` (already loaded with the user record); it is clamped to a valid locale here.
 */
export function emailT(locale: string | null | undefined) {
  const loc = toLocale(locale);
  return createTranslator({ locale: loc, messages: MESSAGES[loc], namespace: "emails" });
}

export type EmailTranslator = Awaited<ReturnType<typeof emailT>>;

/** Standard, HTML-escaped greeting paragraph shared by every notification e-mail body. */
export function emailGreeting(t: EmailTranslator, username: string): string {
  return `<p>${escHtml(t("greeting", { username }))}</p>`;
}
