import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MCP_MODEL_DOC } from "./mcpModelDoc";

/** Der menschenlesbare Spiegel — laut Header beider Dateien manuell synchron zu halten.
 *  Dieser Test macht aus der Header-Bitte eine Zusicherung: driftet ein Abschnitt, schlägt er fehl.
 *  Der Pfad ist relativ zur Testdatei aufgelöst, nicht zum cwd des Runners. */
const GUIDE_URL = new URL("../../docs/mcp-keyholder-guide.md", import.meta.url);

/** Die Blockquote-Notiz direkt unter dem Guide-Titel („Spiegel von …") existiert im TS-Original
 *  bewusst nicht — nur SIE wird vor dem Vergleich entfernt (erste Blockquote-Zeilengruppe, ein
 *  Test unten sichert zu, dass es wirklich sie ist). Jede andere Blockquote wäre Inhalt und
 *  nimmt am Vergleich teil. */
const MIRROR_NOTE = /^(?:>.*\n)+/m;

type Section = { heading: string; body: string };

/** Zerlegt ein Dokument an seinen Überschriften in Abschnitte. Der Titelblock (# …) ist der
 *  erste Abschnitt, damit auch der Einleitungstext verglichen wird. Körper werden
 *  whitespace-normalisiert, damit reiner Zeilenumbruch keine Drift ist. */
function sections(text: string): Section[] {
  return text
    .split(/^(?=#{1,3} )/m)
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const [heading, ...body] = block.split("\n");
      return { heading: heading.trim(), body: body.join(" ").replace(/\s+/g, " ").trim() };
    });
}

const guideRaw = readFileSync(GUIDE_URL, "utf8");
const doc = sections(MCP_MODEL_DOC);
const guide = sections(guideRaw.replace(MIRROR_NOTE, ""));

describe("mcpModelDoc.ts und docs/mcp-keyholder-guide.md sind synchron", () => {
  it("der Parser findet die Abschnitte tatsächlich", () => {
    // Ohne diese Zusicherung würde ein kaputtes Split-Muster beide Seiten als leer
    // (und damit als gleich) durchwinken.
    expect(doc.length).toBeGreaterThan(10);
  });

  it("die ausgeblendete Blockquote ist wirklich die Spiegel-Notiz", () => {
    const note = guideRaw.match(MIRROR_NOTE)?.[0] ?? "";
    expect(note, "Spiegel-Notiz (Blockquote unter dem Titel) fehlt im Guide").toContain(
      "mcpModelDoc.ts",
    );
  });

  it("beide Dokumente haben dieselben Überschriften in derselben Reihenfolge", () => {
    expect(guide.map((s) => s.heading)).toEqual(doc.map((s) => s.heading));
  });

  const guideBodies = new Map(guide.map((s) => [s.heading, s.body]));
  it.each(doc.map((s) => [s.heading, s.body] as const))(
    "Abschnitt %s ist inhaltsgleich",
    (heading, body) => {
      expect(guideBodies.get(heading)).toBe(body);
    },
  );
});
