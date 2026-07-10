const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * Liest das `error`-Feld aus einer fehlgeschlagenen API-Antwort (nie werfend — ein nicht-JSON-Body
 * wie eine HTML-Fehlerseite oder ein leerer 502-Body ergibt `null`).
 *
 * Bei Routen mit STABILEN Fehler-CODES (settings/*, auth/*, entries/*) ist das Ergebnis der Code,
 * den `useApiError()` in den `errors`-Namespace auflöst; unbekannte/fehlende Codes fallen dort auf
 * die generische Meldung zurück.
 */
export async function parseApiErrorCode(res: Response): Promise<string | null> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" && body.error ? body.error : null;
}

/**
 * Wie `parseApiErrorCode()`, gibt aber direkt eine anzeigbare Meldung zurück.
 *
 * Achtung Abgrenzung: NUR für Routen, deren `error` bereits eine anzeigbare Meldung ist. Routen mit
 * stabilen Fehler-Codes (siehe oben) gehören über `parseApiErrorCode()` + `useApiError()`.
 */
export async function parseApiError(res: Response, fallback: string): Promise<string> {
  return (await parseApiErrorCode(res)) ?? fallback;
}

/** URL + RequestInit für einen Eintrag: `entryId` gesetzt = Bearbeiten (PATCH), sonst Anlegen (POST). */
export function entryRequest(entryId: string | null | undefined, payload: unknown): [string, RequestInit] {
  return [
    entryId ? `/api/entries/${entryId}` : "/api/entries",
    { method: entryId ? "PATCH" : "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) },
  ];
}

/** Legt einen Eintrag für einen fremden User an (Keyholder/Admin-Aktionen). */
export function postAdminEntry(userId: string, payload: object): Promise<Response> {
  return fetch("/api/admin/entries", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ userId, ...payload }),
  });
}

/** Admin-Entry anlegen + Antwort auf die Form-Core-Kontrakt-Form abbilden.
 *  `resolveError` ist der `useApiError()`-Resolver des aufrufenden Formulars — die Route liefert
 *  stabile Fehler-Codes, die Übersetzung passiert im Client.
 *  Rückgabetyp strukturell statt `SubmitResult` aus `@/app/entries/types` — ein `lib/`-Modul
 *  soll nicht auf `app/` zeigen. Zuweisungskompatibel zu `SubmitResult`. */
export async function submitAdminEntry(
  userId: string,
  payload: object,
  resolveError: (code: string | null) => string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await postAdminEntry(userId, payload);
  if (res.ok) return { ok: true };
  return { ok: false, error: resolveError(await parseApiErrorCode(res)) };
}
