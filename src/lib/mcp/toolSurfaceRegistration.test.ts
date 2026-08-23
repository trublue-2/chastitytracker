import { describe, it, expect } from "vitest";
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
