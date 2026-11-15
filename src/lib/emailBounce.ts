/**
 * Rückläufer-Erkennung: Adressen, an die Mails immer wieder endgültig scheitern, werden nicht mehr
 * angeschrieben und dem Nutzer als Hinweis gezeigt.
 *
 * Der Tracker sieht den Fehler selbst nie — der Relay nimmt die Mail an, die Ablehnung kommt erst
 * später als Rückläufer im Postfach des Absenders an. Dieses Postfach liest NUR das Portal
 * (ein Leser statt einer je Instanz) und schreibt die drei Felder unten direkt in die Instanz-DB.
 * Der Tracker wertet sie hier aus. Die Schwelle (wann gesperrt wird) liegt beim Schreiber im Portal.
 *
 * Ohne Portal (Self-Hosting) bleiben die Felder auf 0/null — nichts ändert sich.
 */
import { prisma } from "@/lib/prisma";

/** Setzt die Rückläufer-Erkennung zurück — gehört in JEDES Update, das `User.email` ändert: eine
 *  neue Adresse beginnt ohne Vorgeschichte, sonst bliebe sie für den Versand gesperrt. */
export const EMAIL_BOUNCE_RESET = {
  emailBounceCount: 0,
  emailLastBounceAt: null,
  emailBlockedAt: null,
} as const;

/** Ist an diese Adresse der Versand gesperrt? Sucht über die Adresse, weil die Mail-Funktionen nur
 *  sie kennen. `email` ist unique, also höchstens eine Zeile. Wirft nie: eine fehlgeschlagene
 *  Abfrage heisst „im Zweifel senden" — eine Mail mehr ist harmloser als eine verschluckte. */
export async function isEmailBlocked(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const row = await prisma.user.findUnique({ where: { email }, select: { emailBlockedAt: true } });
    return row?.emailBlockedAt != null;
  } catch {
    return false;
  }
}

/** Die Felder für ein Update von `User.email`: bei einer ANDEREN Adresse mit zurückgesetzter
 *  Vorgeschichte, bei derselben unverändert — wer dieselbe kaputte Adresse noch einmal speichert,
 *  soll die Sperre nicht damit aufheben. */
export async function emailUpdateData(userId: string, email: string | null) {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return current?.email === email ? { email } : { email, ...EMAIL_BOUNCE_RESET };
}
