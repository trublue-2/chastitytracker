/** Stable error codes returned by the shared service layer as `ServiceResult.error`, and by the
 *  routes that wrap it. The browser resolves them via `useApiError()` against the `errors` message
 *  namespace; an MCP agent gets the English sentence via `unwrap()` (see mcpWrite.ts).
 *
 *  Same contract as `entryErrors.ts`, one layer up: every code here MUST have a key in
 *  messages/de.json AND messages/en.json (enforced by serviceErrorCodes.test.ts), otherwise it
 *  silently degrades to the generic error message in the UI and to a bare token in the MCP.
 *
 *  This module stays free of imports so it can be reached from client components (via the services'
 *  types) without dragging `next/server` or `prisma` into the browser bundle — same rule as
 *  `codedError.ts`.
 *
 *  Naming: codes are namespaced by the concept they belong to (`LOCK_*`, `INSPECTION_*`, …) only
 *  where the concept actually changes the sentence. Two codes that resolve to the same text in both
 *  locales are one code — a split the reader cannot see is not a distinction.
 *
 *  What is NOT shared: the bare `NOT_LOCKED` / `ALREADY_LOCKED` in `entryErrors.ts`. Those are
 *  worded for the *entry* routes, where a user acts on their own device ("Öffnen nur möglich wenn
 *  aktuell verschlossen"). The service layer speaks to a keyholder *about a third party* ("Der
 *  Benutzer ist nicht verschlossen") and therefore carries its own `USER_NOT_LOCKED` /
 *  `USER_ALREADY_LOCKED`. Reusing the entry codes would show a keyholder a sentence written for the
 *  sub — it typechecks, the parity test passes, and nobody notices.
 */

/** Codes that are not specific to one service. `NOT_FOUND`, `USER_ID_REQUIRED`, `USER_NOT_FOUND`,
 *  `INVALID_DEVICE` and `INVALID_ORGASM_TYPE` already exist for the entry routes with the same
 *  meaning and wording, and are deliberately reused rather than duplicated. */
export const SHARED_SERVICE_CODES = [
  "NOT_FOUND",
  "USER_ID_REQUIRED",
  "USER_NOT_FOUND",
  "INVALID_DEVICE",
  "INVALID_ORGASM_TYPE",
  "USER_NO_EMAIL",
  "INVALID_DATETIME",
  "INTERNAL_ERROR",
  "UNKNOWN_ACTION",
  "USER_NOT_LOCKED",
  "USER_ALREADY_LOCKED",
] as const;

/** kontrolleService + the inspection routes. */
export const INSPECTION_CODES = [
  "INSPECTION_NOT_FOUND",
  "INSPECTION_ALREADY_WITHDRAWN",
  "INSPECTION_NO_SUBMISSION",
  "INSPECTION_ALREADY_ACTIVE",
  "INSPECTION_NOT_WITHDRAWN",
] as const;

/** vorgabeService (training goals). `INVALID_CATEGORY` sitzt hier und nicht bei den geteilten
 *  Codes: es ist ein Vorgaben-Begriff mit genau einem Aufrufer. */
export const GOAL_CODES = [
  "INVALID_CATEGORY",
  "GOAL_NOT_FOUND",
  "GOAL_USER_AND_START_REQUIRED",
  "GOAL_START_REQUIRED",
  "GOAL_PERIOD_TARGET_REQUIRED",
  "CATEGORY_DISALLOWS_GOALS",
] as const;

/** verschlussAnforderungService (lock requests + lock periods). */
export const LOCK_CODES = [
  "LOCK_INVALID_ART",
  "LOCK_INVALID_SEND_TIME",
  "LOCK_DEADLINE_REQUIRED",
  "LOCK_INVALID_LOCK_END",
  "LOCK_PERIOD_NOT_FOUND",
  "LOCK_PERIOD_ONLY_HAS_END",
  "LOCK_PERIOD_ALREADY_WITHDRAWN",
  "LOCK_PERIOD_END_MUST_BE_FUTURE",
] as const;

/** orgasmusAnforderungService (orgasm directives). */
export const ORGASM_DIRECTIVE_CODES = [
  "ORGASM_INVALID_ART",
  "ORGASM_WINDOW_REQUIRED",
  "ORGASM_END_BEFORE_START",
  "ORGASM_NOT_OPEN",
] as const;

/** strafurteilService. Reachable only through the MCP (`judge_offense`) — no route calls it — so
 *  these surface as English sentences via `unwrap()`, never in the browser. They still need both
 *  translations: the parity test makes no exception, and a future admin route would need them. */
export const JUDGMENT_CODES = [
  "JUDGMENT_NOT_FOUND",
  "PENALTY_NOT_PUNISHED",
  "PENALTY_TEXT_REQUIRED",
  "OFFENSE_NOT_FOUND",
] as const;

/** deviceReferenceService (curated device reference photos). */
export const REFERENCE_CODES = [
  "REFERENCE_ENTRY_NOT_FOUND",
  "REFERENCE_COPY_FAILED",
  "REFERENCE_NOT_FOUND",
  "REFERENCE_SOURCE_REQUIRED",
] as const;

/** reinigungService / autoKontrolleService / inspectionEscalationService. These predate the registry
 *  and are camelCase; their message keys are already shipped, so they keep their spelling rather
 *  than churn both locale files for cosmetics. New codes use the SCREAMING_SNAKE form above. */
export const SETTINGS_CODES = [
  "noFieldsToUpdate",
  "invalidTime",
] as const;

/** Every code the service layer can return — the set the i18n parity test iterates. */
export const SERVICE_ERROR_CODES = [
  ...new Set<string>([
    ...SHARED_SERVICE_CODES,
    ...INSPECTION_CODES,
    ...GOAL_CODES,
    ...LOCK_CODES,
    ...ORGASM_DIRECTIVE_CODES,
    ...JUDGMENT_CODES,
    ...REFERENCE_CODES,
    ...SETTINGS_CODES,
  ]),
] as readonly string[];

/** The union every `ServiceResult` failure must name. Typing `ServiceResult.error` as this (rather
 *  than `string`) is what stops a service from silently returning a sentence: prose does not
 *  typecheck, so the "code vs. prose" confusion becomes a compile error instead of a `t.has()` miss
 *  that degrades to the generic message. */
export type ServiceErrorCode =
  | (typeof SHARED_SERVICE_CODES)[number]
  | (typeof INSPECTION_CODES)[number]
  | (typeof GOAL_CODES)[number]
  | (typeof LOCK_CODES)[number]
  | (typeof ORGASM_DIRECTIVE_CODES)[number]
  | (typeof JUDGMENT_CODES)[number]
  | (typeof REFERENCE_CODES)[number]
  | (typeof SETTINGS_CODES)[number];
