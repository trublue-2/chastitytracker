/**
 * Feedback an die Entwickler: wohin es geht und wer es schickt.
 *
 * Client-erreichbar (das Formular teilt die Adress-Prüfung mit der Route), deshalb nur importfreie
 * Abhängigkeiten. Die ENV-Abfragen laufen nur auf dem Server; im Client-Bundle wären sie leer.
 */
import { isPortalInstance } from "./portalInstance";

/** Posteingang im Portal. Self-Hoster leiten mit FEEDBACK_UPSTREAM_URL um oder schalten mit
 *  DISABLE_FEEDBACK=true ab. */
export const FEEDBACK_DEFAULT_UPSTREAM_URL = "https://portal.chastitytracker.ch/api/app-feedback";

export const FEEDBACK_GITHUB_ISSUES_URL = "https://github.com/trublue-2/chastitytracker/issues/new";

/**
 * - `off` — Feedback abgeschaltet, kein Knopf.
 * - `standard` — Portal-Instanz oder ein Self-Hoster mit eigenem Posteingang: kein Hinweis nötig.
 * - `selfHosted` — ein Self-Hoster schickt an den Portal-Posteingang. Die Adresse im Formular ist dann
 *   der EINZIGE Rückweg zum Absender; das Formular sagt es deutlich und bietet GitHub an.
 */
export type FeedbackMode = "off" | "standard" | "selfHosted";

export function feedbackMode(env: Record<string, string | undefined> = process.env): FeedbackMode {
  if (env.DISABLE_FEEDBACK === "true") return "off";
  if (isPortalInstance(env) || env.FEEDBACK_UPSTREAM_URL) return "standard";
  return "selfHosted";
}

/** Reservierte Test-Domains (RFC 2606/6761) — dort liest nie jemand mit. */
const RESERVED_DOMAIN_RE = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/;
/** noreply, no-reply, donotreply, do-not-reply — am Anfang der Adresse oder eines Domain-Teils.
 *  Verankert, damit ein echter Name wie `bruno-reply@…` nicht mitgefangen wird. */
const NO_REPLY_RE = /(^|[@.])(no|do-?not)-?reply/;

/** Eine Adresse, auf die offensichtlich niemand antworten kann (`noreply@…`, `…@example.com`).
 *  Erwartet eine bereits als E-Mail gültige Adresse. */
export function isThrowawayEmail(email: string): boolean {
  const address = email.trim().toLowerCase();
  return NO_REPLY_RE.test(address) || RESERVED_DOMAIN_RE.test(address.split("@")[1] ?? "");
}
