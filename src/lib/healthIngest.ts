import { createHmac, timingSafeEqual, createHash } from "crypto";

/**
 * Der Zugang für automatisch gemeldete Wiegungen — ein iOS-Kurzbefehl liest den Wert aus Apple
 * Health und schickt ihn an `/api/integration/weight` (docs/gewicht-health.md).
 *
 * **Ein Token JE TRÄGER, abgeleitet statt gespeichert.** Die Heimdall-Route nebenan kommt mit einem
 * einzigen Instanz-Secret aus, weil dort ein Server spricht, den der Betreiber betreibt. Hier liegt
 * der Zugang auf dem Handy des Trägers — mit einem gemeinsamen Secret könnte jeder Träger Werte für
 * JEDEN anderen der Instanz schreiben. Das Token ist deshalb ein HMAC über seinen Benutzernamen:
 * pro Person verschieden, ohne Spalte, ohne Ausgabe-Verwaltung.
 *
 * **Was das nicht kann: einzeln widerrufen.** Wer ein Token zurücknehmen will, dreht das
 * Instanz-Secret — dann sind alle neu. Für den Zweck ist das vertretbar: der Token schreibt
 * ausschliesslich Gewichte für genau eine Person, und die kann sie ohnehin selbst eintippen.
 * Wäre er je mehr wert, gehört er in eine Tabelle mit Ablauf und Rückruf.
 */

/** `null`, wenn die Instanz den Zugang nicht führt — dann gibt es den Endpunkt nicht. */
export function healthIngestSecret(): string | null {
  return process.env.HEALTH_INGEST_SECRET || null;
}

/** Das Token eines Trägers. Gekürzt auf 32 Zeichen: es wird von Hand in einen Kurzbefehl kopiert,
 *  und 64 Hex-Zeichen sind dabei kein Sicherheitsgewinn, sondern eine Fehlerquelle. */
export function healthTokenFor(username: string): string | null {
  const secret = healthIngestSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(`weight:${username}`).digest("hex").slice(0, 32);
}

/**
 * Prüft ein vorgelegtes Token gegen den Benutzernamen — konstante Zeit über SHA-256, dasselbe
 * Muster wie `checkBoxSyncSecret` (gleicht die Längen an und verhindert damit ein Timing-Leck).
 */
export function checkHealthToken(username: string, token: string | null | undefined): boolean {
  const expected = healthTokenFor(username);
  if (!expected || !token) return false;
  const sha = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(sha(token), sha(expected));
}
