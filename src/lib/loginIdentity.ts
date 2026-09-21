import { prisma } from "@/lib/prisma";

/**
 * Wer mit dieser Eingabe im Anmeldefeld gemeint ist — Benutzername ODER E-Mail-Adresse.
 *
 * **Warum es das braucht.** Beim Portal meldet man sich mit der E-Mail an, beim Tracker bis 6.2.4
 * nur mit dem Benutzernamen. Nutzer verwechseln die beiden: ein Keyholder versuchte es zweimal mit
 * seiner E-Mail, im Log stand „unbekannter Benutzer", und er hielt sich für ausgesperrt.
 *
 * EINE Stelle für Anmeldung, Sperr-Status und „Passwort vergessen" — drei Kopien derselben Suche
 * liefen auseinander, und dann hiesse „gesperrt" im einen Weg etwas anderes als im anderen.
 *
 * Die Regel:
 * - Leer (auch nach dem Trimmen) heisst niemand.
 * - Zuerst EXAKT über den Benutzernamen — erst wie getippt, dann getrimmt. Er hat Vorrang: sonst fände ein Benutzername mit `@` über
 *   die E-Mail eines ANDEREN Kontos hinein.
 * - Nur ohne Treffer und nur mit `@`: über die E-Mail, ohne Rücksicht auf Gross-/Kleinschreibung.
 *   Gespeichert wird sie so, wie sie eingegeben wurde (auf den Instanzen stehen gemischte
 *   Schreibweisen), und `mode: "insensitive"` kennt SQLite nicht. Verglichen wird deshalb in JS —
 *   pro Instanz sind es eine Handvoll Zeilen, und `toLowerCase()` faltet anders als SQLites
 *   `lower()` auch Umlaute.
 * - Passt die E-Mail auf MEHR als ein Konto, ist niemand gemeint. Geraten wird nicht: das falsche
 *   Konto zu sperren oder ihm einen Reset-Link zu schicken, wäre schlimmer als keine Antwort.
 */
export async function findUserByLogin(identifier: string | null | undefined) {
  const raw = identifier ?? "";
  const input = raw.trim();
  if (!input) return null;

  // ZUERST genau so, wie getippt: Benutzernamen werden ungetrimmt gespeichert, und auf den Instanzen
  // gibt es mindestens einen mit Leerzeichen am Rand. Bis 6.2.4 fand er sich so — getrimmt allein
  // fände er sich nie mehr, und „ anna" würde zu einem Anmeldeversuch auf „anna".
  const exact = await prisma.user.findUnique({ where: { username: raw } });
  if (exact) return exact;
  const byUsername = raw === input ? null : await prisma.user.findUnique({ where: { username: input } });
  if (byUsername || !input.includes("@")) return byUsername;

  // Nur Id und E-Mail für den Vergleich — die ganze Zeile (samt Passwort-Hash) lädt erst der Treffer.
  const wanted = normalizeEmail(input);
  const candidates = await prisma.user.findMany({ where: { email: { not: null } }, select: { id: true, email: true } });
  const matches = candidates.filter((u) => u.email !== null && normalizeEmail(u.email) === wanted);
  // Die letzte Abfrage läuft IMMER, auch ohne Treffer: sonst kostete eine bekannte E-Mail eine
  // Abfrage mehr als eine unbekannte, und die Antwortzeit verriete, ob es sie gibt.
  return prisma.user.findUnique({ where: { id: matches.length === 1 ? matches[0].id : "" } });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Was eine Eingabe im Anmeldefeld bedeutet — in EINEM Aufruf, weil Anmeldung und Sperr-Status beides
 * zugleich brauchen und sich sonst jeder die zweite Hälfte selbst zusammensetzte.
 *
 * - `user`: das gemeinte Konto oder `null` ({@link findUserByLogin}).
 * - `identity`: worunter die Fehlversuche ZÄHLEN — das Konto, nicht die Schreibweise. Wer abwechselnd
 *   Benutzername und E-Mail eingibt, soll das Limit nicht verdoppeln; ein gefundenes Konto zählt
 *   deshalb unter seinem Benutzernamen. Eine unbekannte Eingabe zählt unter sich selbst (getrimmt),
 *   wie bis 6.2.4 — sie wird also genauso gesperrt wie ein Konto, und der Sperr-Status verrät nicht,
 *   ob es sie gibt.
 * - `viaEmail`: kam der Treffer über die E-Mail? Nur für das Log.
 */
export async function resolveLogin(identifier: string | null | undefined): Promise<{
  user: Awaited<ReturnType<typeof findUserByLogin>>;
  identity: string;
  viaEmail: boolean;
}> {
  const input = identifier?.trim() ?? "";
  const user = await findUserByLogin(identifier);
  return { user, identity: user?.username ?? input, viaEmail: !!user && user.username.trim() !== input };
}
