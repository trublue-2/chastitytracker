/**
 * Welche Push-Adressen nimmt der Server an?
 *
 * **Warum eine Liste:** der Server schickt an jede gespeicherte `endpoint`-Adresse eine POST-Anfrage
 * (`web-push`). Wer dort eine beliebige URL eintragen kann, lässt den Server interne Ziele anfragen
 * (SSRF) — auf einer Portal-Instanz sitzt der Container im selben Docker-Netz wie alle anderen.
 * Ein echter Browser bekommt seine Adresse immer von seinem Push-Dienst; die Dienste sind bekannt.
 *
 * Bewusst **importfrei** (per Test abgesichert): Route und Test teilen sie.
 *
 * Nicht dabei: UnifiedPush/ntfy und andere selbst gewählte Dienste. Sie würden die Liste wieder
 * zu einer Formsache machen; wer sie braucht, ergänzt hier einen Host mit Begründung.
 */

/** Genaue Hostnamen. */
const EXACT_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Edge, Opera, Samsung Internet, Android-Browser
  "android.googleapis.com", // ältere Chrome-Abos (`/gcm/send`), die es noch gibt
  "web.push.apple.com", // Safari / iOS-Web-App
]);

/** Dienst-Domains, unter denen Subdomains vergeben werden (Region, Shard). Das Ende ist `.<suffix>`. */
const SUFFIXES = [
  "push.services.mozilla.com", // Firefox: updates.push.services.mozilla.com, autopush-Varianten
  "notify.windows.com", // Edge/WNS: wns2-par02p.notify.windows.com
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (EXACT_HOSTS.has(host)) return true;
  return SUFFIXES.some((s) => host.endsWith(`.${s}`));
}
