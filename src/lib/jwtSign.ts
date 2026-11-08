/**
 * Ein JWT aus Kopf und Nutzlast bauen — die Kodierung (base64url, Punkt-Trennung) an EINER Stelle.
 * Signiert wird vom Aufrufer, weil sich nur das unterscheidet: APNs ES256 (`ieee-p1363`), FCM RS256.
 */
export function signJwt(header: object, claims: object, sign: (signingInput: string) => Buffer): string {
  const input = `${b64url(header)}.${b64url(claims)}`;
  return `${input}.${sign(input).toString("base64url")}`;
}

const b64url = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
