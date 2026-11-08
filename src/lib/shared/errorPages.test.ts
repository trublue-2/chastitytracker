import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * Fehler- und 404-Seiten: ohne sie fällt jede Absage auf die englische Standardseite von Next,
 * ausserhalb der Farbwelt. Je Bereich eine eigene, damit die Navigation bei einem Seitenfehler
 * stehen bleibt (ein Fehler im Wurzel-Segment risse sie mit weg).
 */
const AREAS = ["src/app", "src/app/dashboard", "src/app/admin"];

describe("Fehlerseiten", () => {
  it.each(AREAS)("%s hat error.tsx (Client-Komponente) und not-found.tsx", (dir) => {
    expect(existsSync(`${dir}/not-found.tsx`)).toBe(true);
    expect(readFileSync(`${dir}/error.tsx`, "utf8").trimStart().startsWith('"use client"')).toBe(true);
  });

  it("die Fehlerseite zeigt error.message nie an (Pfade, SQL, Interna)", () => {
    const src = readFileSync("src/app/components/ErrorScreen.tsx", "utf8")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(src).not.toMatch(/\.message/);
  });
});
