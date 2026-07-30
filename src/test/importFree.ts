import { expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * TEST-ONLY (liegt bewusst ausserhalb von `src/lib/`: importiert `vitest`, eine devDependency —
 * ein Import aus Produktivcode wäre ein Fehler).
 *
 * Prüft, dass ein Modul keinerlei `import`/`require` mitbringt.
 *
 * Die Importfreiheit ist bei diesen Modulen eine Bundle-Zusicherung, kein Stil: sie werden von
 * Client-Komponenten UND von server-only Code importiert. Ein einziger Server-Import (`prisma`,
 * `next/server`) zöge damit Server-Code ins Client-Bundle — ohne Typfehler, ohne Testrot. Darum
 * wird die Eigenschaft geprüft statt nur im Header behauptet.
 *
 * Zentral, weil sie inzwischen für mehrere Module gilt (`codedError.ts`, `entryFormRoute.ts`) und
 * die Regex sonst in jeder Testdatei erneut stünde — mit dem Risiko, dass eine Kopie eine
 * Import-Schreibweise nicht mehr erkennt.
 */
export function expectImportFree(path: string): void {
  const source = readFileSync(path, "utf8");
  expect(source.match(/^\s*import\s|[^.\w]require\s*\(/gm) ?? []).toEqual([]);
}
