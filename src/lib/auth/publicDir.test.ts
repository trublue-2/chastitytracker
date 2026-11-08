import { describe, it, expect } from "vitest";
import { readdirSync } from "fs";

/**
 * `public/` wird von Next OHNE Anmeldung ausgeliefert — unter `/<datei>`, am Proxy-Gate vorbei
 * (der Matcher nimmt nur `_next/*` und `favicon.ico` aus, aber statische Dateien aus `public/`
 * liefert Next vor jeder Route). Ein Nutzer-Foto dort wäre damit für jeden abrufbar. Die Fotos
 * liegen deshalb in `data/uploads` und gehen nur über `/api/uploads/…`.
 *
 * Der Test hält fest, was in `public/` steht: ein neues Verzeichnis muss hier bewusst eingetragen
 * werden, und ein Verzeichnis, das nach Nutzerdaten klingt, ist nie eine Ausnahme.
 */
const ALLOWED_DIRS = ["screenshots", "splash"];
/** Für DATEIEN im Wurzelverzeichnis — Verzeichnisse pinnt `ALLOWED_DIRS` schon genau. */
const FORBIDDEN_NAMES = /upload|photo|foto|image|bild|data|backup|export/i;

describe("public/", () => {
  const entries = readdirSync("public", { withFileTypes: true });

  it("enthält nur die erlaubten Verzeichnisse", () => {
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(dirs).toEqual(ALLOWED_DIRS);
  });

  it("trägt nichts, was nach Nutzerdaten heisst", () => {
    expect(entries.map((e) => e.name).filter((n) => FORBIDDEN_NAMES.test(n))).toEqual([]);
  });
});
