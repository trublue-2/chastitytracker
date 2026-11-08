/**
 * Fehler mit stabilem Code, um eine Transaktion abzubrechen und ihn AUSSERHALB wieder einzufangen.
 *
 * Warum eine Property `_code` und keine `class ServiceError`: der Code wird teils über
 * MODULGRENZEN hinweg gefangen — `inspectionEscalationService` fängt das `NOT_LOCKED` aus
 * `oeffnenService`, und `api/entries/[id]` fängt sein eigenes `PARTNER_GONE`. Eine Klasse würde
 * `instanceof` über Modul-Instanzen hinweg voraussetzen; ein Property-Tag ist robuster.
 *
 * Dieses Modul bleibt bewusst IMPORTFREI (per Test abgesichert): Es wird aus Modulen benutzt, die
 * auch aus Client-Komponenten erreichbar sind. Ohne Imports kann hier gar keine Server-Abhängigkeit
 * (`next/server`, `prisma`) ins Client-Bundle geraten. Die HTTP-förmigen Helfer (`serviceErrors`,
 * `mapServiceError`) leben deshalb in `serviceResult.ts`, nicht hier.
 */
export function codedError(code: string): Error {
  return Object.assign(new Error(code), { _code: code });
}

/** Liest den Code eines via {@link codedError} geworfenen Fehlers; `undefined` bei allem anderen. */
export function codeOf(e: unknown): string | undefined {
  return (e as { _code?: string } | null | undefined)?._code;
}
