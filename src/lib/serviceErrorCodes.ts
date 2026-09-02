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
 *  `INVALID_DEVICE`, `INVALID_ORGASM_TYPE`, `FORBIDDEN` and `INVALID_IMAGE_URL` already exist for the
 *  entry routes with the same meaning and wording, and are deliberately reused rather than
 *  duplicated.
 *
 *  `INVALID_CATEGORY` lives here rather than with the goal codes: it is raised wherever a category
 *  is assigned to something the caller owns — training goals AND devices. */
export const SHARED_SERVICE_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "USER_ID_REQUIRED",
  "USER_NOT_FOUND",
  "INVALID_DEVICE",
  "INVALID_IMAGE_URL",
  "INVALID_CATEGORY",
  "INVALID_ORGASM_TYPE",
  "USER_NO_EMAIL",
  "INVALID_DATETIME",
  // Ebenfalls aus `entryErrors.ts` MITBENUTZT statt dupliziert (samt Übersetzung): „muss nach dem
  // vorherigen Eintrag liegen" wirft `createOeffnenEntryTx`, und den Dienst rufen inzwischen auch
  // Pfade ausserhalb der Entry-Routen (`releaseNowService`). Ohne den Code hier fiele ihre
  // Fehlertabelle durch und eine gewöhnliche Ablehnung endete als 500.
  "TIME_BEFORE",
  // Wie `NOT_FOUND` und `INVALID_IMAGE_URL` schon bei den Entry-Routen deklariert und hier bewusst
  // MITBENUTZT statt dupliziert: „Zeitpunkt darf nicht in der Zukunft liegen" ist derselbe Satz,
  // egal ob ein Eintrag oder ein notiertes Vergehen vordatiert wird.
  "TIME_IN_FUTURE",
  "INTERNAL_ERROR",
  "UNKNOWN_ACTION",
  "USER_NOT_LOCKED",
  "USER_ALREADY_LOCKED",
  // Beide gehören zu keinem Dienst, sondern zum Zustand des Aufrufers: er drückt zu schnell, oder
  // er hat gar kein Gerät für Push angemeldet. Bewusst NICHT unter `INSPECTION_*`, obwohl heute nur
  // die Code-Wiederholung sie wirft — der Satz änderte sich für einen zweiten Aufrufer nicht.
  "TOO_MANY_REQUESTS",
  "PUSH_NOT_ENABLED",
] as const;

/** kontrolleService + the inspection routes. */
export const INSPECTION_CODES = [
  "INSPECTION_NOT_FOUND",
  "INSPECTION_ALREADY_WITHDRAWN",
  "INSPECTION_NO_SUBMISSION",
  "INSPECTION_ALREADY_ACTIVE",
  "INSPECTION_NOT_WITHDRAWN",
  // Ziel-Kontrollen (v5.0.1): das Gegenstück zu USER_NOT_LOCKED für Trage-Kategorien, dazu die
  // beiden Fehler, die nur ein ZIEL haben kann — es existiert nicht (mehr), oder das verlangte
  // Gerät ist nicht das getragene.
  "USER_NOT_WEARING",
  "INSPECTION_TARGET_INVALID",
  "INSPECTION_DEVICE_NOT_ACTIVE",
  // Die Kontrolle läuft, verlangt aber gar keinen Code (Gerät mit `requireInspectionCode: false`) —
  // es gibt nichts zu wiederholen. Eigener Code statt `INSPECTION_NOT_FOUND`: die Anforderung ist
  // da, und „nicht gefunden" schickte den Sub auf die falsche Fehlersuche.
  "INSPECTION_NO_CODE",
  // Der selbst gewählte Code einer Selbstkontrolle taugt nicht als Code (keine Ziffern, zu kurz, zu
  // lang). Nur auf dem Weg, auf dem der Code vom Aufrufer kommt — bei einer Anforderung hat ihn der
  // Server selbst vergeben.
  "INSPECTION_CODE_INVALID",
  // Tages-Ausnahmen der Auto-Kontrollen: mehr Regeln als die Woche Tage hat, und die Regel, die den
  // Tag stumm schaltet, weil ihr Auslöse-Fenster ganz im Schlaf liegt. Beide bekommen einen eigenen
  // Code statt `timeRangeInvalid` — dessen Satz („Ende muss nach dem Start liegen") schickte die
  // Keyholderin auf die Suche nach einem Tippfehler, den sie nicht gemacht hat.
  "INSPECTION_DAY_RULES_TOO_MANY",
  "INSPECTION_TRIGGER_WINDOW_ALL_QUIET",
] as const;

/** vorgabeService (training goals). `INVALID_CATEGORY` sass hier, solange der vorgabeService der
 *  einzige Aufrufer war; seit die Geräte-Routen dieselbe Besitz-Prüfung teilen, steht es oben. */
export const GOAL_CODES = [
  "GOAL_NOT_FOUND",
  "GOAL_USER_AND_START_REQUIRED",
  "GOAL_START_REQUIRED",
  "GOAL_PERIOD_TARGET_REQUIRED",
  "CATEGORY_DISALLOWS_GOALS",
  // B-02 (MCP-Befundliste 2026-07-17): Plausibilitätsschranken für Stundenwerte.
  "GOAL_DAY_TARGET_TOO_HIGH",
  "GOAL_WEEK_TARGET_TOO_HIGH",
  "GOAL_MONTH_TARGET_TOO_HIGH",
  "GOAL_YEAR_TARGET_TOO_HIGH",
  "GOAL_WEEK_UNREACHABLE_VS_DAY",
  "GOAL_MONTH_UNREACHABLE_VS_DAY",
  "GOAL_YEAR_UNREACHABLE_VS_DAY",
] as const;

/** verschlussAnforderungService (lock requests + lock periods). */
export const LOCK_CODES = [
  "LOCK_INVALID_ART",
  "LOCK_INVALID_SEND_TIME",
  "LOCK_DEADLINE_REQUIRED",
  "LOCK_DURATION_OR_END",
  "LOCK_INVALID_LOCK_END",
  "LOCK_REQUEST_NOT_FOUND",
  "LOCK_REQUEST_NOT_EDITABLE",
  "LOCK_PERIOD_NOT_FOUND",
  "LOCK_PERIOD_ONLY_HAS_END",
  "LOCK_PERIOD_ALREADY_WITHDRAWN",
  "LOCK_PERIOD_END_MUST_BE_FUTURE",
  "LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER",
] as const;

/** orgasmusAnforderungService (orgasm directives). */
export const ORGASM_DIRECTIVE_CODES = [
  "ORGASM_INVALID_ART",
  "ORGASM_WINDOW_REQUIRED",
  "ORGASM_END_BEFORE_START",
  "ORGASM_END_MUST_BE_FUTURE",
  "ORGASM_INVALID_SEND_TIME",
  "ORGASM_NOT_OPEN",
] as const;

/** strafurteilService, erreichbar über den MCP (`judge_offense`) — dort werden sie via `unwrap()` zu
 *  englischen Sätzen. Ausnahme ist `OFFENSE_NOT_FOUND`: es beschreibt „zu dieser Referenz gibt es
 *  kein offenes Vergehen" und gilt wörtlich auch für den Rückzug eines notierten Vergehens
 *  (/api/admin/offense), der es im BROWSER zeigt — darum steht es hier und nicht doppelt unten.
 *  Beide Übersetzungen braucht ohnehin jeder Code, der Paritätstest macht keine Ausnahme. */
export const JUDGMENT_CODES = [
  "JUDGMENT_NOT_FOUND",
  // Das Gegenstück zu `JUDGMENT_NOT_FOUND`: über dieses Vergehen steht schon ein Urteil, und der
  // Aufrufer wollte keines ersetzen (`allowRevision: false`, der Browser-Weg). Ausdrücklich NICHT
  // das gleichnamig klingende `OFFENSE_ALREADY_JUDGED` der manuellen Vergehen: dort ist der nächste
  // Schritt „Urteil zurücknehmen, dann zurückziehen", hier „Seite neu laden" — die Anfrage kam aus
  // einer veralteten Ansicht, und was danach zu tun ist, hängt vom Urteil ab, das sie nicht kennt.
  "JUDGMENT_ALREADY_EXISTS",
  "PENALTY_NOT_PUNISHED",
  "PENALTY_TEXT_REQUIRED",
  "OFFENSE_NOT_FOUND",
  // Die ref bezeichnet ein Vergehen — aber nicht das, welches der Aufrufer behauptet (siehe
  // `JudgeOffenseParams.offenseType`). Bewusst kein zweites `OFFENSE_NOT_FOUND`: „weg" und
  // „verwechselt" führen zu verschiedenen nächsten Schritten.
  "OFFENSE_TYPE_MISMATCH",
  // Das Feld FEHLT in der Anfrage — nicht zu verwechseln mit „gibt es nicht mehr"
  // (`OFFENSE_NOT_FOUND`) oder „passt nicht" (`OFFENSE_TYPE_MISMATCH`). Aus der Oberfläche
  // unerreichbar, weil sie beide Felder immer mitschickt; wer hier landet, hat einen Fehler im
  // Aufruf und wird von „lade die Seite neu" nur in die Irre geschickt.
  "OFFENSE_REF_REQUIRED",
  "OFFENSE_TYPE_REQUIRED",
] as const;

/** manualOffenseService (von Hand notierte Vergehen).
 *
 *  Eigene `OFFENSE_*`-Codes statt der gleichlautenden `TASK_TITLE_*`: die Namensräume folgen hier
 *  durchgehend dem Begriff, nicht dem Satz. Den Zukunfts-Zeitpunkt deckt dagegen das geteilte
 *  `TIME_IN_FUTURE` ab — dort ist der Satz wirklich derselbe.
 *
 *  `OFFENSE_ALREADY_JUDGED` gehört ALLEIN hierher: es beantwortet „warum lässt sich diese Notiz
 *  nicht zurückziehen" und nennt dafür den konkreten nächsten Schritt (erst das Urteil zurücknehmen,
 *  dann zurückziehen). Der ähnlich klingende Konflikt beim URTEILEN steht als
 *  `JUDGMENT_ALREADY_EXISTS` bei den Urteils-Codes — ein Satz, der beide bedienen soll, gibt keinem
 *  von beiden den richtigen nächsten Schritt. */
export const MANUAL_OFFENSE_CODES = [
  "OFFENSE_TITLE_REQUIRED",
  "OFFENSE_TITLE_TOO_LONG",
  "OFFENSE_DESCRIPTION_TOO_LONG",
  "OFFENSE_ALREADY_WITHDRAWN",
  "OFFENSE_ALREADY_JUDGED",
] as const;

/** Die Massen-Aktionen des Posteingangs (`/api/messages/bulk`). Der Nutzer bekommt sie nur zu
 *  sehen, wenn eine Anfrage nicht aus der Oberfläche stammt — die kreuzt Zeilen an, die es gibt. */
export const MESSAGE_BULK_CODES = [
  "MESSAGE_IDS_REQUIRED",
  "MESSAGE_ACTION_INVALID",
] as const;

/** deviceReferenceService (curated device reference photos). */
export const REFERENCE_CODES = [
  "REFERENCE_ENTRY_NOT_FOUND",
  "REFERENCE_COPY_FAILED",
  "REFERENCE_NOT_FOUND",
  "REFERENCE_SOURCE_REQUIRED",
] as const;

/** Die /api/devices-Routen (Geräte anlegen, bearbeiten, archivieren, wiederherstellen).
 *  `INVALID_CATEGORY` und `INVALID_IMAGE_URL` teilen sie sich mit den geteilten Codes oben.
 *
 *  Die beiden Längen-Codes nennen ihr Limit bewusst NICHT: eine Meldung wie „max. {max} Zeichen"
 *  bräuchte einen ICU-Parameter, den `unwrap()` an der MCP-Grenze nicht füllen kann (der Agent sähe
 *  `{max}` wörtlich) und den `useApiError()` nur mit den Passwort-Konstanten belegt — also mit der
 *  falschen Zahl. Die Zahl gehört ans Eingabefeld (`maxLength`), nicht in den Fehlertext. */
export const DEVICE_CODES = [
  "DEVICE_NAME_REQUIRED",
  "DEVICE_NAME_TOO_LONG",
  "DEVICE_DESCRIPTION_TOO_LONG",
  "DEVICE_INVALID_PRICE",
  "DEVICE_INVALID_CURRENCY",
  "DEVICE_CURRENCY_REQUIRED",
  "DEVICE_NOT_ARCHIVED",
  "DEVICE_ARCHIVED_NOT_EDITABLE",
  "DEVICE_INVALID_CODE_REQUIREMENT",
] as const;

/**
 * /api/categories/[id] — die drei REGELN einer Kategorie (Zeiterfassung, Pflichtfoto,
 * Trainingsziele erlaubt).
 *
 * Eigene Codes, weil die Schranke eine andere ist als bei den übrigen Kategorie-Feldern: Name, Farbe
 * und Symbol gehören dem Eigentümer, die drei Regeln dem Keyholder. Ein Träger, der `allowVorgaben`
 * abschalten könnte, nähme der Keyholderin das Trainingsziel aus der Hand — dieselbe Begründung wie
 * bei `Device.requireInspectionCode`.
 */
export const CATEGORY_RULE_CODES = [
  "CATEGORY_RULE_FORBIDDEN",
  "CATEGORY_BUILTIN_RULE_IMMUTABLE",
] as const;

/** /api/box/relock — den Box-Schliessbefehl neu setzen (Reparaturweg, wenn die Box offen steht,
 *  während die Session läuft — z.B. nach Sperrzeit-Ablauf mit scharfgestellter Öffnung). */
export const BOX_CODES = [
  "BOX_RELOCK_NOT_LOCKED",
  "BOX_RELOCK_KEY_NOT_IN_BOX",
] as const;

/** taskService (Aufgaben: Anweisungstext + 0..n Bedingungen, die bis `holdUntil` durchgehend gelten). */
export const TASK_CODES = [
  "TASK_NOT_FOUND",
  "TASK_NOT_EDITABLE",
  // Gelöscht wird NUR eine zurückgezogene Aufgabe. Eine laufende oder abgeschlossene ist Teil
  // der Historie des Trägers — sie verschwinden zu lassen hiesse, ein Urteil über ihn
  // spurlos zu tilgen. Der Rückzug ist die Entscheidung der Keyholderin, sie zu verwerfen.
  "TASK_NOT_WITHDRAWN",
  "TASK_TITLE_REQUIRED",
  "TASK_TITLE_TOO_LONG",
  "TASK_DESCRIPTION_TOO_LONG",
  "TASK_HOLD_UNTIL_TOO_SOON",
  /** Weder ein Endzeitpunkt noch eine Dauer genannt — eine Aufgabe ohne Frist gibt es nicht. */
  "TASK_HOLD_MISSING",
  /** Dauer-Modus ohne Bedingungen: die Dauer läuft ab dem ANLEGEN, und ohne Bedingung gibt es
   *  nichts anzulegen — die Uhr fände nie ihren Start. Eine reine Textaufgabe braucht deshalb einen
   *  Zeitpunkt. */
  "TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS",
  /** Der Zeitpunkt, ab dem eine terminierte Aufgabe gilt, liess sich nicht lesen. */
  "TASK_INVALID_SEND_TIME",
  "TASK_REQUIREMENT_INVALID",
  "TASK_REQUIREMENT_KG_CATEGORY",
  "TASK_DUPLICATE_REQUIREMENT",
  "TASK_PROOF_INVALID",
  "TASK_TOO_MANY_PROOFS",
  "TASK_PROOF_NOT_FOUND",
  "TASK_PROOF_ALREADY_SUBMITTED",
  "TASK_PROOF_TOO_LATE",
  "TASK_PROOF_NOT_SUBMITTED",
  /** Die EIGENE Fälligkeit eines Nachweises liegt hinter dem Ende der Aufgabe. Sie könnte dort nie
   *  greifen — `proofDeadline` deckelt sie auf das Ende —, also wird sie abgewiesen statt still
   *  gekappt: die Keyholderin soll sehen, dass ihre Angabe nicht das bedeutet, was sie meint. */
  "TASK_PROOF_DUE_AFTER_END",
] as const;

/** offenseRulesService (welche Vergehensarten bei einem Sub überhaupt gelten). Beide Codes trennen
 *  zwei Fehler, die der Absender auseinanderhalten muss: die ART ist gar nicht schaltbar
 *  (`manual_offense`, Tippfehler) — oder sie ist es, aber dieser MODUS gehört nicht zu ihr
 *  (`lockedOnly` bei einer binären Art). */
export const OFFENSE_RULE_CODES = [
  "OFFENSE_TYPE_NOT_SWITCHABLE",
  "OFFENSE_MODE_INVALID",
] as const;

/** cleaningService / autoKontrolleService / inspectionEscalationService. These predate the registry
 *  and are camelCase; their message keys are already shipped, so they keep their spelling rather
 *  than churn both locale files for cosmetics. New codes use the SCREAMING_SNAKE form above. */
export const SETTINGS_CODES = [
  "noFieldsToUpdate",
  "invalidTime",
  "timeRangeInvalid",
  "CLEANING_WINDOWS_TOO_MANY",
] as const;

/** Gesundheits-Halt (`healthHold.ts`). Ein Grund ist PFLICHT — dieselbe Schranke wie im MCP
 *  (`set_health_hold`), und aus demselben Grund: die Pause setzt jede Direktive aus, und die
 *  Keyholderin muss in einer Woche noch nachlesen können, warum. */
export const HEALTH_HOLD_CODES = [
  "HEALTH_HOLD_REASON_REQUIRED",
  // Abgewiesen, weil eine Pause läuft. Die Absage ist Absicht und nicht bloss Schutz: sie sagt der
  // Keyholderin, dass ihr Träger pausiert ist — still zu schlucken hiesse, sie im Glauben zu lassen,
  // die Direktive sei unterwegs. Wer bewusst darüber hinweg will, hebt die Pause auf.
  "HEALTH_HOLD_ACTIVE",
] as const;

/** Gewichtstracking (docs/gewicht-konzept.md). Seit dem Umbau auf EIN Zielgewicht melden diese Codes
 *  nur noch Tippfehler und fehlende Voraussetzungen — die Regel-Codes des alten Zielkorridors
 *  (`WEIGHT_CORRIDOR_*`) sind mit der Nur-Weiten-Regel entfallen. */
export const WEIGHT_CODES = [
  "WEIGHT_OUT_OF_RANGE",
  "HEIGHT_OUT_OF_RANGE",
  "WEIGHT_TRACKING_DISABLED",
  "WEIGHING_WINDOWS_TOO_MANY",
  "INVALID_UNIT_SYSTEM",
  "WEIGHT_PROOF_REQUIRED",
  "WEIGHT_IN_FUTURE",
  // Freigabe-Vorgabe (docs/gewicht-freigabe-konzept.md). Sie gehört zur Gewichts-Familie, nicht zu
  // den Orgasmus-Codes: geprüft wird eine Gewichts-Bedingung, das Fenster entsteht erst danach.
  "RELEASE_INVALID_DIRECTION",
  "RELEASE_NOT_BEFORE_MUST_BE_FUTURE",
  "RELEASE_TOO_MANY_MEASUREMENTS",
  "RELEASE_UNDERWEIGHT",
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
    ...MANUAL_OFFENSE_CODES,
    ...MESSAGE_BULK_CODES,
    ...REFERENCE_CODES,
    ...DEVICE_CODES,
    ...CATEGORY_RULE_CODES,
    ...BOX_CODES,
    ...TASK_CODES,
    ...OFFENSE_RULE_CODES,
    ...SETTINGS_CODES,
    ...WEIGHT_CODES,
    ...HEALTH_HOLD_CODES,
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
  | (typeof MANUAL_OFFENSE_CODES)[number]
  | (typeof MESSAGE_BULK_CODES)[number]
  | (typeof REFERENCE_CODES)[number]
  | (typeof DEVICE_CODES)[number]
  | (typeof CATEGORY_RULE_CODES)[number]
  | (typeof BOX_CODES)[number]
  | (typeof TASK_CODES)[number]
  | (typeof OFFENSE_RULE_CODES)[number]
  | (typeof SETTINGS_CODES)[number]
  | (typeof WEIGHT_CODES)[number]
  | (typeof HEALTH_HOLD_CODES)[number];
