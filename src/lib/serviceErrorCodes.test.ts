import { describe, it, expect } from "vitest";
import { SERVICE_ERROR_CODES } from "./serviceErrorCodes";
import { ENTRY_ERROR_CODES } from "./entryErrors";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

const LOCALES = [["de", de], ["en", en]] as const;

/** Beide Registries speisen denselben `errors`-Namespace, also gehört die Parity-Prüfung EINMAL
 *  hierher — über die Vereinigung. (entryErrors.test.ts prüft zusätzlich, dass die Entry-Routen nur
 *  deklarierte Codes ausschreiben; das ist eine andere Frage und bleibt dort.) */
const ALL_DECLARED_CODES: readonly string[] = [...new Set([...SERVICE_ERROR_CODES, ...ENTRY_ERROR_CODES])];

// Ein Fehler-Code ohne Key im `errors`-Namespace fällt in useApiError() still auf die generische
// Meldung zurück, und `unwrap()` (mcpWrite.ts) reicht dem MCP-Agenten den nackten Token durch.
// Beides ohne Typ- oder Laufzeitfehler — dieser Test ist die einzige Absicherung.
describe("error codes have translations", () => {
  it.each(LOCALES)("%s.json defines every declared error code", (_locale, messages) => {
    const errors: Record<string, string> = messages.errors;
    const missing = ALL_DECLARED_CODES.filter((code) => !errors[code]);
    expect(missing).toEqual([]);
  });
});

// Die Gegenrichtung: ein Key, den niemand mehr zurückgibt, ist toter Ballast in beiden Locales.
// Entry- und Service-Codes teilen sich den `errors`-Namespace, deshalb wird gegen die Vereinigung
// geprüft. Die Ausnahmeliste sind Keys, die NICHT aus einer ServiceResult-Antwort stammen:
//  - Auth-/Settings-Routen, die (noch) keinen Registry-Eintrag haben; `passwordTooShort`/
//    `passwordTooLong` tragen zudem ICU-Parameter ({min}/{max}), die `serviceFail` nicht füllen kann.
//  - `timeRangeInvalid` wird rein clientseitig geworfen (CleaningToggle prüft Start < Ende, bevor
//    überhaupt ein Request rausgeht) — es gibt keine Route, die diesen Code je zurückgibt.
const UNREGISTERED_KEYS = new Set([
  "passwordTooShort", "passwordTooLong", "missingFields", "tokenInvalid",
  "usernameRequired", "usernameLength", "emailInvalid", "usernameTaken", "emailTaken",
  "invalidRole", "cannotDeleteSelf", "lastAdmin", "invalidTimezone", "invalidStartPage", "invalidHideOwnTracker",
  "invalidNoticeVersion",
  "timeRangeInvalid",
  // Die Dashboard-Konfiguration geht denselben Weg wie die übrigen Selbst-Einstellungen
  // (`userSelfFieldRoute` gibt den Code direkt zurück, kein ServiceResult) — deshalb hier und
  // nicht in SERVICE_ERROR_CODES, und deshalb camelCase wie ihre Geschwister.
  "layoutInvalid", "layoutUnknownSurface", "layoutUnknownBlock", "layoutForeignBlock",
]);

describe("errors namespace has no orphaned keys", () => {
  it("every errors key is either a declared code or a known unregistered key", () => {
    const declared = new Set<string>([...SERVICE_ERROR_CODES, ...ENTRY_ERROR_CODES]);
    const orphans = Object.keys(de.errors).filter(
      (k) => !declared.has(k) && !UNREGISTERED_KEYS.has(k),
    );
    expect(orphans).toEqual([]);
  });

  it("de and en declare exactly the same error keys", () => {
    expect(Object.keys(de.errors).sort()).toEqual(Object.keys(en.errors).sort());
  });
});

// Die Codes der Services dürfen sich NICHT mit den Entry-Codes überschneiden, ausser bei den
// bewusst geteilten (gleiche Bedeutung, gleicher Wortlaut). Sonst bekäme ein Keyholder einen Satz
// zu sehen, der für den Sub geschrieben wurde — typprüfbar ist das nicht.
const INTENTIONALLY_SHARED = [
  "NOT_FOUND", "USER_ID_REQUIRED", "USER_NOT_FOUND", "INVALID_DEVICE", "INVALID_ORGASM_TYPE",
  // Die Geräte-Routen liegen im Service-Register, geben aber dieselbe Absage („Kein Zugriff") und
  // dieselbe Bild-URL-Rüge wie die Entry-Routen. Gleicher Wortlaut, gleicher Adressat (der User über
  // sein eigenes Gerät) — ein zweiter Code wäre eine Unterscheidung ohne Unterschied.
  "FORBIDDEN", "INVALID_IMAGE_URL",
  // „Zeitpunkt darf nicht in der Zukunft liegen" — derselbe Satz, ob ein Sub seinen Eintrag
  // vordatiert oder ein Keyholder ein notiertes Vergehen (`manualOffenseService`). Kein Adressaten-
  // wechsel, der eine eigene Formulierung nötig machte.
  "TIME_IN_FUTURE",
  // "Zeitpunkt muss nach dem vorherigen Eintrag liegen" wirft `createOeffnenEntryTx`, und diesen
  // Kern ruft seit "Sofort aufschliessen" auch ein Dienst ausserhalb der Entry-Routen. Derselbe
  // Sachverhalt, derselbe Satz — und er trägt in beide Richtungen: er beschreibt die Reihenfolge
  // der Eintraege, nicht wer sie erfasst hat.
  "TIME_BEFORE",
  // „Der Zeitpunkt widerspricht der Reihenfolge der Einträge" — geworfen von `assertEntryTimeOk`,
  // und die ruft seit der Eintrags-Korrektur über den MCP auch ein Dienst (`correctEntry`), nicht
  // mehr nur die Route. Wie `TIME_BEFORE` beschreibt der Satz die KETTE, nicht den Handelnden; für
  // Keyholderin und Träger steht dasselbe da.
  "INVALID_ORDER",
  // Die Geräte-Regeln des Trage-Eintrags: beim Anlegen von `prepareWearEntry` geworfen, beim
  // Korrigieren von `entryCorrection.ts` — dieselbe Regel, derselbe Satz. Er beschreibt das GERÄT
  // („braucht eine Kategorie", „der Käfig gehört nicht in eine Trage-Zeile"), nicht den Handelnden.
  "WEAR_DEVICE_REQUIRED", "WEAR_DEVICE_NO_CATEGORY", "WEAR_DEVICE_KG",
  // „Der Partner-Eintrag hat sich geändert" — geworfen beim Löschen eines Paares, in der Route
  // wie im Dienst. Der Satz beschreibt die ZEILE, nicht den Handelnden.
  "PARTNER_CHANGED",
  // Der Öffnungsgrund wird gegen die Liste DES TRÄGERS geprüft — beim Anlegen wie beim
  // Korrigieren, mit demselben Satz.
  "INVALID_OPENING_REASON",
];

describe("service codes do not silently collide with entry codes", () => {
  it("only the intentionally shared codes appear in both registries", () => {
    const overlap = SERVICE_ERROR_CODES.filter((c) => ENTRY_ERROR_CODES.includes(c));
    expect(overlap.sort()).toEqual([...INTENTIONALLY_SHARED].sort());
  });

  // Die geteilten Codes sind nur dann korrekt, wenn ihr Wortlaut in BEIDEN Kontexten trägt. Der
  // Entry-Satz ist an den Sub adressiert („Öffnen nur möglich wenn aktuell verschlossen"), der
  // Service-Satz an den Keyholder über den Sub — deshalb eigene Codes für den Verschluss-Zustand.
  it("the lock-state codes are NOT shared with the entry routes", () => {
    for (const code of ["NOT_LOCKED", "ALREADY_LOCKED"]) {
      expect(SERVICE_ERROR_CODES).not.toContain(code);
    }
    expect(SERVICE_ERROR_CODES).toContain("USER_NOT_LOCKED");
    expect(SERVICE_ERROR_CODES).toContain("USER_ALREADY_LOCKED");
  });
});

// Zwei Codes mit identischem Text in BEIDEN Locales sind eine Unterscheidung, die der Leser nicht
// sieht — also keine. Der Test hält die Registry davor, wieder auseinanderzudriften (früher gab es
// INSPECTION_USER_NOT_LOCKED und LOCK_USER_NOT_LOCKED mit wortgleicher Meldung).
describe("no two service codes carry the same message in both locales", () => {
  it("every (de, en) message pair belongs to exactly one code", () => {
    const deE: Record<string, string> = de.errors;
    const enE: Record<string, string> = en.errors;
    const byText = new Map<string, string[]>();
    for (const code of SERVICE_ERROR_CODES) {
      const key = `${deE[code]}\u0000${enE[code]}`;
      byText.set(key, [...(byText.get(key) ?? []), code]);
    }
    const dupes = [...byText.values()].filter((codes) => codes.length > 1);
    expect(dupes).toEqual([]);
  });
});

// Die MCP-Grenze: ein Agent hat keinen `errors`-Namespace, also übersetzt `unwrap()` den Code in den
// englischen Satz. Ohne diese Auflösung sähe der Agent nur `LOCK_USER_ALREADY_LOCKED`.
describe("MCP boundary resolves codes to English sentences", () => {
  it("every service code has a non-empty English sentence to surface", () => {
    const errors: Record<string, string> = en.errors;
    const empty = SERVICE_ERROR_CODES.filter((c) => !errors[c]?.trim());
    expect(empty).toEqual([]);
  });

  it("no service code's English message carries an ICU parameter unwrap() cannot fill", () => {
    // `unwrap()` reicht den Rohtext durch — ein `{min}` käme wörtlich beim Agenten an.
    const errors: Record<string, string> = en.errors;
    const parameterised = SERVICE_ERROR_CODES.filter((c) => /\{\w+\}/.test(errors[c] ?? ""));
    expect(parameterised).toEqual([]);
  });
});
