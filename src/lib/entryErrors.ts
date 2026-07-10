/** Stable error codes returned by the entry routes as `{ error: "<CODE>" }`. The client resolves
 *  them via `useApiError()` against the `errors` message namespace — the entry routes never send a
 *  human-readable sentence. Every code here MUST have a key in messages/de.json AND messages/en.json
 *  (enforced by entryErrors.test.ts), otherwise it silently degrades to the generic error message.
 *
 *  This module stays free of `next/server`: `constants.ts` imports it and is reachable from client
 *  components. `codedError.ts` is importable here because it is itself import-free.
 */

import { codedError, codeOf } from "@/lib/codedError";

/** Raised by the transaction guards inside the entry routes (always answered with 400). */
export const ENTRY_GUARD_CODES = [
  "INVALID_DEVICE",
  "ALREADY_LOCKED",
  "NOT_LOCKED",
  "TIME_BEFORE",
  "TIME_IN_FUTURE",
  "INVALID_ORDER",
  "WEAR_DEVICE_REQUIRED",
  "WEAR_DEVICE_NO_CATEGORY",
  "WEAR_DEVICE_KG",
  "WEAR_PHOTO_REQUIRED",
  "ALREADY_WEARING",
  "NOT_WEARING",
] as const;

/** Returned by `validateEntryPayload` (constants.ts) for a malformed create-payload. */
export const ENTRY_VALIDATION_CODES = [
  "INVALID_IMAGE_URL",
  "START_TIME_REQUIRED",
  "TIME_IN_FUTURE",
  "INVALID_TYPE",
  "DEVICE_CATEGORIES_DISABLED",
  "OPENING_REASON_REQUIRED",
  "NOTE_REQUIRED",
  "INSPECTION_PHOTO_REQUIRED",
  "INVALID_ORGASM_TYPE",
] as const;

/** Emitted directly by an entry route, outside the guard/validation paths. */
export const ENTRY_ROUTE_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "INVALID_OPENING_REASON",
  "INVALID_ORGASM_TYPE",
  "INVALID_IMAGE_URL",
  "INVALID_DEVICE",
  "TIME_FORWARD_ONLY",
  "TIME_BACKWARD_ONLY",
  "PARTNER_CHANGED",
  "USER_ID_REQUIRED",
  "USER_NOT_FOUND",
] as const;

export type EntryGuardCode = (typeof ENTRY_GUARD_CODES)[number];
export type EntryValidationCode = (typeof ENTRY_VALIDATION_CODES)[number];

/** Every code an entry route can return — the set the i18n parity test iterates. */
export const ENTRY_ERROR_CODES: readonly string[] = [
  ...new Set([...ENTRY_GUARD_CODES, ...ENTRY_VALIDATION_CODES, ...ENTRY_ROUTE_CODES]),
];

function isEntryGuardCode(code: string | undefined): code is EntryGuardCode {
  return !!code && (ENTRY_GUARD_CODES as readonly string[]).includes(code);
}

/** Aborts an entry transaction with a stable code. Unwrapped again by `entryGuardCode`. */
export function entryGuardError(code: EntryGuardCode): Error {
  return codedError(code);
}

/** Reads the guard code off an error thrown inside an entry transaction.
 *  Anything else is a genuine failure and is rethrown, so callers can use this inline:
 *  `catch (e) { return NextResponse.json({ error: entryGuardCode(e) }, { status: 400 }); }` */
export function entryGuardCode(e: unknown): EntryGuardCode {
  const code = codeOf(e);
  if (isEntryGuardCode(code)) return code;
  throw e;
}
