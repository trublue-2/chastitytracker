import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";

/**
 * Keine Komponente wird im Rumpf einer anderen deklariert.
 *
 * **Warum ein Test und nicht Disziplin:** eine Funktion, die im Rumpf ihres Elters steht, ist bei
 * jedem Render eine NEUE Funktion. React sieht an der Stelle einen anderen Komponenten-Typ, reisst
 * den ganzen Teilbaum ab und hängt ihn neu ein — der Zustand darin ist weg und der Fokus fällt aus
 * dem Feld. Es kompiliert, es sieht im Review richtig aus, und in der Bedienung fällt es nur
 * sporadisch auf: ausgelöst wird es nicht vom Tippen, sondern von IRGENDEINEM Render weiter oben.
 *
 * Anlass: `StrafbuchClient` hielt acht Bauteile im Rumpf, darunter das Urteils-Formular mit dem
 * Begründungs-Feld. Wer dort schrieb, verlor den Text, sobald oben etwas neu rendern liess — ein
 * Toast genügt. Der Fehler war in derselben Datei EINMAL kommentiert und als „eigene Aufräum-Runde"
 * aufgeschoben worden; bis dahin kostete er den Nutzer mehrfach seinen getippten Text. Genau diese
 * Sorte Aufschub soll der Test unmöglich machen.
 *
 * Bauart nach `pageMeasures.test.ts`: über den Baum lesen statt eine Dateiliste pflegen, und vor
 * dem Vergleich die Kommentare entfernen — die Begründungen in diesem Baum nennen die gesuchten
 * Muster reihenweise selbst. Die Ausnahme `[^:]` rettet `https://…`.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ALL = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((f: string) => f.endsWith(".tsx"))
  .map((f: string) => `src/${f}`)
  .sort();

/** Eine Deklaration mit MINDESTENS zwei Leerzeichen davor steht nicht auf Modul-Ebene. */
const NESTED_FUNCTION = /\n[ ]{2,}function ([A-Z]\w*)\s*\(/g;
const NESTED_ARROW = /\n[ ]{2,}const ([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[a-z_$][\w$]*)\s*(?::[^=]+)?=>/g;

/** Gibt der Rumpf JSX zurück? Sonst ist es ein Helfer, der zufällig gross beginnt. */
function looksLikeComponent(after: string): boolean {
  return /return\s*\(?\s*</.test(after.slice(0, 2000)) || /=>\s*\(?\s*</.test(after.slice(0, 200));
}

describe("keine verschachtelten Komponenten", () => {
  it("findet überhaupt Dateien — sonst prüft der Test nichts", () => {
    expect(ALL.length).toBeGreaterThan(150);
  });

  it("deklariert keine Komponente im Rumpf einer anderen", () => {
    const hits: string[] = [];
    for (const file of ALL) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const re of [NESTED_FUNCTION, NESTED_ARROW]) {
        re.lastIndex = 0;
        for (let m = re.exec(src); m !== null; m = re.exec(src)) {
          if (!looksLikeComponent(src.slice(m.index + m[0].length))) continue;
          hits.push(`${file}: ${m[1]}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
