import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { measureToolSurface } from "@/app/api/[transport]/route";

/**
 * Die Messung schickt JEDES registrierte Eingabe-Schema durch `z.toJSONSchema`. Wirft eines davon,
 * trifft das den Handler-Bau — also den gesamten MCP-Endpunkt. Deshalb hier an den echten
 * Registrierungen geprüft und nicht an einer nachgebauten Stichprobe: eine Stichprobe erwischt genau
 * das eine Schema nicht, das jemand morgen mit einem ungewöhnlichen Zod-Typ ergänzt.
 */
describe("measureToolSurface — über die echten Registrierungen", () => {
  it("misst alle Werkzeuge, ohne zu werfen", () => {
    expect(measureToolSurface(false)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("ist stabil: zweimal messen ergibt denselben Wert", () => {
    expect(measureToolSurface(false)).toBe(measureToolSurface(false));
  });

  it("das Bild-Werkzeug ändert die Oberfläche", () => {
    // Der Bildersafe schaltet `get_image` frei. Eine Sitzung, die davor verbunden hat, kennt es
    // nicht — das ist ein echter Unterschied und muss sich im Wert zeigen.
    expect(measureToolSurface(true)).not.toBe(measureToolSurface(false));
  });
});

describe("die tragende Annahme: Parameter-Beschreibungen landen im JSON-Schema", () => {
  it("`.describe()` erscheint in `z.toJSONSchema`", () => {
    // Darauf steht und fällt das Ganze. Der Vorfall vom 23.08.2026 WAR eine geänderte
    // Parameter-Beschreibung („Omit to start now" → „Omit to start at the next midnight"): fiele
    // sie aus dem Schema, bliebe der Fingerabdruck stehen und der Envelope bestätigte der Sitzung
    // ihren veralteten Text als aktuell — schlimmer als gar kein Signal. Werkzeug-Titel und
    // -Beschreibung gehen direkt in den Hash, die Parameter nur auf diesem Weg.
    const schema = z.strictObject({ validFrom: z.string().optional().describe("Omit to start at the next midnight.") });
    expect(JSON.stringify(z.toJSONSchema(schema))).toContain("Omit to start at the next midnight.");
  });
});

/**
 * Jedes SCHREIBENDE Werkzeug muss `reason` in seinem Schema deklarieren.
 *
 * Der Grund ist ein Vorfall, kein Prinzip: `set_weight_tracking` ging ohne dieses Feld in Betrieb
 * (23.08.2026). Der Wrapper `runWriteTool` verlangt eine nicht-leere Begründung und weist sonst ab —
 * und das SDK strippt unbekannte Schlüssel, bevor der Handler sie sieht, sodass auch ein Agent, der
 * `reason` freiwillig mitschickt, nicht durchkommt. Das Werkzeug war damit zu hundert Prozent tot,
 * bei jedem Aufruf, mit einer Fehlermeldung, die nach einem Bedienfehler der KI aussieht.
 *
 * Warum das kein Test der Werkzeug-Logik finden kann: die Lücke sitzt in der REGISTRIERUNG, nicht im
 * Handler. Die 13 Tests des Werkzeugs waren grün, während es über den MCP nicht ein einziges Mal
 * ausführbar war. Deshalb wird hier der Quelltext gelesen — dieselbe Bauart wie die
 * Format-Prüfungen in `displayFormatRegistry.test.ts`.
 */
describe("Schreib-Werkzeuge deklarieren ihre Begründungs-Pflicht", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/[transport]/route.ts"), "utf8",
  );
  // Ein Abschnitt je Registrierung: alles zwischen zwei `server.registerTool(`-Aufrufen.
  const blocks = source.split("server.registerTool(").slice(1);

  it("findet die Registrierungen überhaupt", () => {
    // Ohne diese Zusicherung wäre eine umbenannte Aufruf-Form ein stiller Freibrief: null Blöcke
    // heisst null Beanstandungen.
    expect(blocks.length).toBeGreaterThan(30);
  });

  it("jedes Werkzeug hinter runWriteTool/runV2Write verlangt `reason`", () => {
    const ohneGrund = blocks
      .filter((b) => /runWriteTool\(|runV2Write\(/.test(b))
      // V1 schreibt `reason: reasonField` aus, V2 bringt es über `...writeMetaFields` mit.
      .filter((b) => !/reason:\s*reasonField/.test(b) && !/\.\.\.writeMetaFields/.test(b))
      .map((b) => b.slice(0, b.indexOf(",")).trim());

    expect(ohneGrund, "\nSchreib-Werkzeug ohne `reason` im Schema:\n" + ohneGrund.join("\n") +
      "\n\n`runWriteTool` weist jeden Aufruf ohne Begründung ab, und das SDK entfernt Schlüssel, die " +
      "das Schema nicht kennt — das Werkzeug wäre unbenutzbar. Ergänze `reason: reasonField` (V1) " +
      "bzw. `...writeMetaFields` (V2).\n").toEqual([]);
  });
});
