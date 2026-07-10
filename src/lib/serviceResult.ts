import { NextResponse } from "next/server";
import { codedError, codeOf } from "@/lib/codedError";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/** Shared result type for service-layer functions called by both API routes and MCP write tools.
 *  `status` is the HTTP status an API route should return on failure.
 *
 *  `error` is a STABLE CODE, never a sentence: the browser resolves it through `useApiError()`
 *  against the `errors` message namespace, an MCP agent through `unwrap()` (mcpWrite.ts). Typing it
 *  as `ServiceErrorCode` is load-bearing — a service that returns prose fails to compile instead of
 *  reaching `t.has()`, missing, and collapsing to the generic "Fehler". */
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: ServiceErrorCode };

/** The failure half of a `ServiceResult`, narrowed. */
export type ServiceFailure = Extract<ServiceResult<never>, { ok: false }>;

/** Rejects with a stable code + HTTP status. Typo-proof: only declared codes typecheck. */
export function serviceFail(status: number, error: ServiceErrorCode): ServiceFailure {
  return { ok: false, status, error };
}

/**
 * Die EINZIGE Art, wie eine Route einen Fehler-Body schreibt. Ohne diesen Helfer stünde in der Route
 * ein nackter String — `NextResponse.json({ error: "NOT_FOUND" })` —, und ein Tippfehler
 * (`"NOT_FOND"`) wäre weder ein Compile- noch ein Testfehler: der Client fiele still auf die
 * generische Meldung zurück. Genau der Defekt, den die Code-Umstellung beseitigen soll. Der
 * `ServiceErrorCode`-Parameter zieht die Typprüfung bis an den Rand der Route.
 */
export function errorResponse(status: number, error: ServiceErrorCode): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Maps a failed ServiceResult onto its API-route response. Split out from `serviceResponse()`
 *  because the success shape differs per route (`{id}`, `{deadline}`, a 204, …) while the failure
 *  shape never does — so every route can share this line even when it cannot share the success one. */
export function serviceFailure(result: ServiceFailure): NextResponse {
  return errorResponse(result.status, result.error);
}

/** Maps a ServiceResult onto the API-route response: `{ok:true}` — or the service's error code with
 *  its HTTP status. Ohne diese Auswertung meldet eine abgelehnte Änderung dem Client Erfolg. */
export function serviceResponse(result: ServiceResult<unknown>): NextResponse {
  return result.ok ? NextResponse.json({ ok: true }) : serviceFailure(result);
}

/** Eine Fehler-Tabelle: Code → HTTP-Status + zurückzugebender Fehler-Code. */
export type ServiceErrorTable = Record<string, { status: number; error: ServiceErrorCode }>;

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
 *       const mapped = mapServiceError(e, ERRORS);
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
