import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/constants";

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

  const matches = await userIdsWithEmail(input);
  // Die letzte Abfrage läuft IMMER, auch ohne Treffer: sonst kostete eine bekannte E-Mail eine
  // Abfrage mehr als eine unbekannte, und die Antwortzeit verriete, ob es sie gibt.
  return prisma.user.findUnique({ where: { id: matches.length === 1 ? matches[0] : "" } });
}

/**
 * Die EINE Schreibweise, in der eine E-Mail gespeichert und verglichen wird: getrimmt und klein.
 *
 * Seit 6.2.5 schreibt jeder Weg, der eine E-Mail setzt, sie so (Einstellungen, Admin anlegen und
 * ändern, `seed.js` spiegelt es). Ältere Zeilen stehen noch in ihrer eingegebenen Schreibweise —
 * deshalb falten die LESENDEN Wege (`findUserByLogin`, {@link emailTakenByOther}) weiterhin beide
 * Seiten, statt sich auf die gespeicherte Form zu verlassen.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Die Konten, deren E-Mail — gefaltet — dieser entspricht. Nur Ids: die ganze Zeile (samt
 *  Passwort-Hash) braucht niemand, der bloss vergleicht. */
async function userIdsWithEmail(email: string): Promise<string[]> {
  const wanted = normalizeEmail(email);
  const candidates = await prisma.user.findMany({ where: { email: { not: null } }, select: { id: true, email: true } });
  return candidates.filter((u) => u.email !== null && normalizeEmail(u.email) === wanted).map((u) => u.id);
}

/**
 * Trägt schon ein ANDERES Konto diese E-Mail — in irgendeiner Schreibweise?
 *
 * Der Unique-Index der Datenbank vergleicht exakt; `A@x.ch` und `a@x.ch` liesse er nebeneinander
 * stehen. Dann passte die Adresse auf zwei Konten, `findUserByLogin` hielte sie für mehrdeutig, und
 * die Anmeldung per E-Mail ginge für BEIDE still nicht mehr. Die schreibenden Wege fragen deshalb
 * vorher hier und antworten mit demselben `emailTaken` wie beim exakten Treffer.
 */
export async function emailTakenByOther(email: string, exceptUserId: string | null): Promise<boolean> {
  return (await userIdsWithEmail(email)).some((id) => id !== exceptUserId);
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

/**
 * Eine eingegebene E-Mail für das Speichern vorbereiten — der EINE Ablauf der drei Wege, die sie
 * setzen (Einstellungen, Admin anlegen, Admin ändern): normalisieren (leer → `null`, heisst
 * „entfernen"), Form prüfen, und prüfen, ob ein ANDERES Konto sie in irgendeiner Schreibweise
 * trägt. Drei eigene Fassungen dieser Schritte waren schon beim Schreiben auseinandergelaufen.
 *
 * Den Unique-Fehler beim eigentlichen Schreiben fängt weiter jede Route selbst: zwischen dieser
 * Prüfung und dem Schreiben kann eine zweite Anfrage dieselbe Adresse setzen.
 */
export async function prepareEmailInput(
  raw: unknown,
  exceptUserId: string | null,
): Promise<{ value: string | null } | { error: "emailInvalid" | "emailTaken"; status: 400 | 409 }> {
  // Nur Text oder „nichts" (null/undefined = entfernen). Alles andere ist ein kaputter Aufruf und
  // darf eine gespeicherte Adresse nicht stillschweigend löschen.
  if (raw != null && typeof raw !== "string") return { error: "emailInvalid", status: 400 };
  const value = typeof raw === "string" ? normalizeEmail(raw) || null : null;
  if (!isValidEmail(value)) return { error: "emailInvalid", status: 400 };
  if (value && await emailTakenByOther(value, exceptUserId)) return { error: "emailTaken", status: 409 };
  return { value };
}

