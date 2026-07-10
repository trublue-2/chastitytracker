const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * Liest die Fehlermeldung aus einer fehlgeschlagenen API-Antwort. Ein nicht-JSON-Body (HTML-
 * Fehlerseite, leerer 502-Body) darf dabei nie werfen — dann greift `fallback`.
 *
 * Achtung Abgrenzung: Routen, die STABILE Fehler-CODES liefern (settings/*, auth/*), werden
 * client-seitig über `useApiError()` in den `errors`-Namespace aufgelöst. Dieser Helper ist für
 * die Routen, deren `error` bereits eine anzeigbare Meldung ist (z.B. /api/entries).
 */
export async function parseApiError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body?.error || fallback;
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
 *  Rückgabetyp strukturell statt `SubmitResult` aus `@/app/entries/types` — ein `lib/`-Modul
 *  soll nicht auf `app/` zeigen. Zuweisungskompatibel zu `SubmitResult`. */
export async function submitAdminEntry(
  userId: string,
  payload: object,
  fallbackError: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await postAdminEntry(userId, payload);
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res, fallbackError) };
}
