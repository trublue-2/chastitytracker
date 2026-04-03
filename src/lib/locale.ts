const MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export function setLocaleCookie(value: string) {
  document.cookie = `locale=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}
