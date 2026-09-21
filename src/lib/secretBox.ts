import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Ein Geheimnis verschlüsselt in der Datenbank ablegen — heute der API-Schlüssel der Foto-Prüfung.
 *
 * **Warum überhaupt verschlüsseln**, wenn Datenbank und `NEXTAUTH_SECRET` auf demselben Server
 * liegen: ein Backup der SQLite-Datei, ein Export für den Support, eine kopierte `prod.db` zum
 * Nachstellen eines Fehlers — all das verlässt den Server ohne die `.env`. Der Schlüssel wäre in
 * jedem dieser Fälle im Klartext mitgereist, und er kostet den Betreiber Geld.
 *
 * AES-256-GCM: authentifiziert, also merkt `openSecret` eine veränderte Zeile, statt Unsinn zu
 * entschlüsseln. Der Schlüssel ist aus `NEXTAUTH_SECRET` ABGELEITET (mit eigenem Zweck-Präfix),
 * nicht das Secret selbst — ein Leck an einer Stelle soll nicht die andere öffnen.
 *
 * **Wechselt `NEXTAUTH_SECRET`, ist das Geheimnis verloren.** `openSecret` liefert dann `null`, und
 * die Prüfung gilt als nicht konfiguriert, bis der Admin den Schlüssel neu einträgt. Das ist der
 * ehrliche Ausgang: raten, was darin stand, kann niemand.
 */

const VERSION = "v1";

function derivedKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  // Ohne Secret gäbe es keinen Schlüssel — und ein fester Ersatzwert wäre eine Verschlüsselung, die
  // nur so aussieht. Laut abbrechen; NextAuth startet ohne NEXTAUTH_SECRET ohnehin nicht.
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set — cannot seal secrets");
  return createHash("sha256").update(`chastitytracker:secret-box:${VERSION}\0${secret}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(".");
}

/** `null` bei jedem Fehler: falsches Format, anderes Secret, veränderte Daten. Wirft nie — der
 *  Aufrufer behandelt ein unlesbares Geheimnis wie ein fehlendes. */
export function openSecret(sealed: string): string | null {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
