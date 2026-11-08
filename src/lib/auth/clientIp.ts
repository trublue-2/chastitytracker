/**
 * Die IP des Aufrufers — der EINE Ort, an dem `X-Forwarded-For` gelesen wird.
 *
 * Traefik hängt die echte Client-IP ans ENDE der Liste; was davor steht, schickt der Aufrufer selbst.
 * Der ERSTE Eintrag ist damit frei wählbar — wer ihn nimmt, lässt jedes Rate-Limit mit einem
 * gefälschten Header umgehen. Deshalb `.at(-1)`, und deshalb nirgends sonst im Code (der Wächter
 * `forbiddenPatterns.test.ts` hält das ein).
 *
 * Bewusst **importfrei**: Proxy und Server-Log nehmen ihn, ohne die Datenbank nachzuziehen.
 * Routen rufen `clientIp(req.headers)`.
 */
export function clientIp(headers: { get(name: string): string | null | undefined }): string {
  // `||` statt `??`: ein leerer Header ist KEIN Wert — sonst bekäme jeder Aufrufer den Schlüssel "".
  return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
