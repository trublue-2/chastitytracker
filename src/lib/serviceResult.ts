import { NextResponse } from "next/server";
import { codedError, codeOf } from "@/lib/codedError";

/** Shared result type for service-layer functions called by both API routes and MCP write tools.
 *  `status` is the HTTP status an API route should return on failure. */
export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Maps a ServiceResult onto the API-route response: `{ok:true}` — or the service's error code with
 *  its HTTP status. Ohne diese Auswertung meldet eine abgelehnte Änderung dem Client Erfolg. */
export function serviceResponse(result: ServiceResult<unknown>): NextResponse {
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Eine Fehler-Tabelle: Code → HTTP-Status + anzeigbare Meldung. */
export type ServiceErrorTable = Record<string, { status: number; error: string }>;

/**
 * Bindet Wurf- und Fang-Seite an EINE Tabelle: der zurückgegebene Werfer akzeptiert nur Codes, die
 * auch gemappt werden. Ohne diese Bindung sind der geworfene Literal und der Tabellen-Key zwei
 * unabhängige Strings — ein Tippfehler auf einer Seite verwandelt einen erwarteten 400/409
 * stillschweigend in einen 500, und kein Test schlägt an.
 */
export function serviceErrors<T extends ServiceErrorTable>(table: T) {
  return {
    table,
    fail: (code: keyof T & string): Error => codedError(code),
  };
}

/**
 * Übersetzt einen erwarteten Fehler-Code in ein `ServiceResult`. Gibt `null` zurück, wenn der
 * Fehler NICHT in der Tabelle steht — der Aufrufer muss ihn dann weiterwerfen, damit echte
 * Defekte nicht als 400 verschluckt werden:
 *
 *     } catch (e) {
 *       const mapped = mapServiceError(e, { NOT_LOCKED: { status: 400, error: "…" } });
 *       if (mapped) return mapped;
 *       throw e;
 *     }
 */
export function mapServiceError(
  e: unknown,
  table: ServiceErrorTable,
): ServiceResult<never> | null {
  const code = codeOf(e);
  // `Object.hasOwn` statt `table[code]`: sonst träfe ein Code wie "constructor" oder "toString" auf
  // eine geerbte Object-Property und lieferte ein `{status: undefined}`-Ergebnis, statt den echten
  // Defekt weiterwerfen zu lassen.
  if (!code || !Object.hasOwn(table, code)) return null;
  const { status, error } = table[code];
  return { ok: false, status, error };
}
