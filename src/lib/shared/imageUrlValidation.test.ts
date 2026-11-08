import { describe, it, expect } from "vitest";
import { listFiles, readStripped } from "@/test/sourceScan";
import { isValidImageUrl, validateEntryPayload } from "./constants";

/**
 * Ein Bild-Feld aus einer Anfrage wird IMMER gegen `isValidImageUrl` geprüft.
 *
 * **Warum:** die URL geht später an den Dateisystem-Lader und an die Vision (`loadUploadedImage`,
 * Anthropic/lokales Modell) und wird beim Löschen eines Eintrags wieder aufgelöst. Eine fremde URL
 * ist damit ein SSRF-Hebel, ein Pfad mit `..` ein Weg aus `data/uploads` heraus. Die Prüfung ist
 * ein Einzeiler — und fehlt deshalb genau dort, wo ein NEUES Feld dazukommt (so blieb
 * `codeImageUrl` an `POST /api/entries` ungeprüft, während `imageUrl` daneben geprüft war).
 *
 * Der Test liest jede Route, die ein `*ImageUrl`-Feld aus der Anfrage zieht, und verlangt, dass sie
 * `isValidImageUrl` selbst ruft oder an einen Dienst übergibt, der es tut (`VALIDATING_CALLS`).
 *
 * Nicht Teil davon: WEM die Datei gehört. Ein Upload ist an keinen Nutzer gebunden — das braucht
 * eine Tabelle und ist eine Schema-Änderung (siehe Bericht zur Sicherheits-Phase).
 */
const ROUTES = listFiles("src/app/api", (f) => f.endsWith("route.ts"));

/** Liest die Route ein `*ImageUrl`-Feld aus der Anfrage? (Destrukturierung aus `body`/`req.json()` oder `body.xImageUrl`.) */
const READS_IMAGE_FIELD =
  /\{[^{}]*\b\w*[iI]mageUrl\b[^{}]*\}\s*=\s*(?:await\s+req\.json\(\)|body\b|\(?body\b)|\bbody\??\.\w*[iI]mageUrl\b|\brequest\.\w*[iI]mageUrl\b/;

/** Aufrufe, die die Prüfung selbst enthalten (jeweils per Test/Lesen belegt). */
const VALIDATING_CALLS = /\b(isValidImageUrl|validateEntryPayload|createEntryForUser|recordWeight|updateWeightEntry|submitBoxPhoto\w*|boxPhotoDue\w*)\(/;

describe("Bild-URL-Prüfung", () => {
  it("jede Route, die ein *ImageUrl-Feld annimmt, prüft es", () => {
    const missing: string[] = [];
    let readers = 0;
    for (const file of ROUTES) {
      const src = readStripped(file);
      if (!READS_IMAGE_FIELD.test(src)) continue;
      readers++;
      if (!VALIDATING_CALLS.test(src)) missing.push(file);
    }
    expect(readers).toBeGreaterThan(12); // der Scanner findet die bekannten Annahme-Stellen
    expect(missing).toEqual([]);
  });

  it("POST /api/entries prüft über validateEntryPayload auch das Code-Foto", () => {
    const base = { type: "VERSCHLUSS", startTime: new Date(Date.now() - 1000).toISOString() };
    expect(validateEntryPayload({ ...base, codeImageUrl: "https://evil.example/x.jpg" }, { requirePhotoForPruefung: false })).toBe("INVALID_IMAGE_URL");
    expect(validateEntryPayload({ ...base, codeImageUrl: "/api/uploads/../../etc/passwd" }, { requirePhotoForPruefung: false })).toBe("INVALID_IMAGE_URL");
  });
});

describe("isValidImageUrl", () => {
  it("lässt nur interne Upload-Pfade und 'kein Bild' zu", () => {
    expect(isValidImageUrl(null)).toBe(true);
    expect(isValidImageUrl(undefined)).toBe(true);
    expect(isValidImageUrl("")).toBe(true);
    expect(isValidImageUrl("/api/uploads/abc-123.jpg")).toBe(true);
  });

  it.each([
    "https://evil.example/a.jpg",
    "//evil.example/a.jpg",
    "http://localhost/api/uploads/a.jpg",
    "/api/uploads/../secret",
    "/api/uploads/..%2F..%2Fsecret",
    "/api/uploads/a/b.jpg",
    "/api/uploads/.hidden",
    "/api/uploads/a.jpg?x=1",
    "/api/uploads/a.jpg\n",
    "file:///etc/passwd",
  ])("verwirft %s", (u) => {
    expect(isValidImageUrl(u)).toBe(false);
  });

  it("verwirft Nicht-Strings, die sich zu einem gültigen Pfad umwandeln liessen", () => {
    expect(isValidImageUrl(["/api/uploads/a.jpg"] as unknown as string)).toBe(false);
    expect(isValidImageUrl({ toString: () => "/api/uploads/a.jpg" } as unknown as string)).toBe(false);
    expect(isValidImageUrl(5 as unknown as string)).toBe(false);
  });
});
