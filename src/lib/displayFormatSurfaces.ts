/**
 * Die tatsächliche Oberfläche der Zahlen-Darstellung, aus dem Quelltext gelesen: wo eine Zahl von
 * Hand zu einer Dauer zusammengesetzt wird, und wo eine Zahl von Hand in Prozent umgerechnet wird.
 *
 * Wozu: bis Etappe A (22.08.2026) schrieben acht Formatierer dieselbe Dauer unterschiedlich, und
 * sechs Stellen rechneten `Math.round(a / b * 100)` je für sich. Das ist nicht durch Nachlässigkeit
 * entstanden, sondern durch den Normalfall — jemand braucht eine Dauer, schreibt zwei Zeilen, und
 * niemand sieht, dass es die Funktion schon gibt. Eine Aufräum-Aktion allein hält deshalb nicht:
 * das Nächste entsteht genauso.
 *
 * Der Scanner ist die Gegenmassnahme. Er findet, was ein Suchen-und-Ersetzen NICHT findet — nämlich
 * die selbstgebauten Fassungen, die keine der bekannten Funktionen aufrufen. Drei davon steckten
 * beim Aufräumen noch im Baum (eine Tage/Stunden-Zerlegung in der Sub-Detailseite, ein
 * `6.5h`-Tooltip im Tragekalender, eine dritte Zerlegung in einer Mail) und sind erst durch diesen
 * Scan aufgefallen.
 *
 * Bewusst ein Zeilen-Scanner statt einer echten Analyse — dieselbe Begründung wie bei
 * `funktionsmodellSurfaces.ts`: er läuft ohne Build, ohne generierten Prisma-Client und ohne
 * laufenden Server, also auch im frischen Klon und im CI-Gate.
 */
import fs from "node:fs";
import path from "node:path";

/** Eine Fundstelle im Quelltext. */
export interface SourceHit {
  /** Pfad relativ zum Projektverzeichnis, mit `/` als Trenner. */
  file: string;
  line: number;
  /** Die getroffene Zeile, getrimmt — Schlüssel für die Ausnahmeliste. */
  text: string;
}

/**
 * Ein Ausdruck in einem Template-Literal, dem unmittelbar eine Zeit-Einheit folgt:
 * `` `${hours}h` ``, `` `${days}T` ``, `` `${m}min` ``.
 *
 * `\}(?:T|d|h|min|m)\b` trifft absichtlich breit; die falsch-positiven Fälle (ISO-Zeitstempel,
 * gekürzte Zahlen im Log) stehen namentlich in der Ausnahmeliste des Registers. Breiter Scan plus
 * benannte Ausnahmen ist die sichere Richtung: eine zu enge Regex findet die nächste selbstgebaute
 * Fassung nicht und ist dabei GRÜN.
 */
const DURATION_ASSEMBLY = /\$\{[^}]+\}(?:T|d|h|min|m)\b/;

/** Eine Umrechnung in Prozent. `\b` schliesst `* 1000` (Millisekunden) aus. */
const PERCENT_MATH = /\*\s?100\b/;

/**
 * Kommentarzeilen zählen nicht. Sie MÜSSEN ausgenommen sein, weil die Begründungen zu genau
 * diesem Gate die alten Formeln zitieren — ohne diese Zeile meldete der Scanner seine eigene
 * Dokumentation als Verstoss. Ein auskommentierter Block wird damit ebenfalls übersehen; das ist
 * richtig so, er läuft ja nicht.
 */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** Alle `.ts`/`.tsx` unterhalb von `src`, ohne Tests, aufsteigend sortiert. */
function sourceFiles(dir: string, root: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, root, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(path.relative(root, p).split(path.sep).join("/"));
    }
  }
  return out;
}

function scan(root: string, pattern: RegExp): SourceHit[] {
  const hits: SourceHit[] = [];
  for (const file of sourceFiles(path.join(root, "src"), root)) {
    const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
    lines.forEach((text, i) => {
      if (!COMMENT_LINE.test(text) && pattern.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

/** Jede Stelle, die eine Dauer-Zeichenkette von Hand zusammensetzt. */
export function readDurationAssemblies(root: string): SourceHit[] {
  return scan(root, DURATION_ASSEMBLY);
}

/** Jede Stelle, die eine Zahl von Hand in Prozent umrechnet. */
export function readPercentMath(root: string): SourceHit[] {
  return scan(root, PERCENT_MATH);
}
