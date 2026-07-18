import { isValidLocale } from "@/lib/constants";

const MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export function setLocaleCookie(value: string) {
  document.cookie = `locale=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

/**
 * At login, force the per-browser `locale` cookie to the just-authenticated account's stored
 * language. Without this, a previous user's cookie on the same browser leaks into the new session:
 * the UI keeps the old language even though the account (and the settings page) shows the new one.
 * Only runs at login, so it never fights a language the user actively switched on this device (that
 * flow sets the cookie itself). No-op if the account has no valid stored locale.
 */
export function syncLocaleCookieFromLogin(accountLocale: unknown) {
  if (isValidLocale(accountLocale)) setLocaleCookie(accountLocale);
}
