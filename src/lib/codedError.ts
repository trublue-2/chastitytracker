import type { ServiceResult } from "@/lib/serviceResult";

/**
 * Fehler mit stabilem Code, um eine Transaktion abzubrechen und ihn AUSSERHALB wieder einzufangen.
 *
 * Warum eine Property `_code` und keine `class ServiceError`: der Code wird teils über
 * MODULGRENZEN hinweg gefangen — `inspectionEscalationService` fängt das `NOT_LOCKED` aus
 * `oeffnenService`, und `api/entries/[id]` fängt sein eigenes `PARTNER_GONE`. Eine Klasse würde
 * `instanceof` über Modul-Instanzen hinweg voraussetzen; ein Property-Tag ist robuster und ist
 * bereits die etablierte Form im Bestand (u.a. `entryErrors.ts`).
 */
export function codedError(code: string): Error {
  return Object.assign(new Error(code), { _code: code });
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

/** Liest den Code eines via {@link codedError} geworfenen Fehlers; `undefined` bei allem anderen. */
export function codeOf(e: unknown): string | undefined {
  return (e as { _code?: string } | null | undefined)?._code;
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
