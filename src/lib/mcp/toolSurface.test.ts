import { describe, it, expect, beforeEach } from "vitest";
import { computeToolSurfaceFingerprint, setToolSurfaceFingerprint, toolSurfaceFingerprint } from "./toolSurface";

/**
 * Der Fingerabdruck ist nur so viel wert wie die Zusage „ändert sich genau dann, wenn sich die
 * gecachte Werkzeug-Oberfläche ändert". Ein Wert, der bei einer geänderten Beschreibung gleich
 * bliebe, wäre schlimmer als keiner: die Sitzung hielte ihre veraltete Liste dann für bestätigt.
 */

const tool = (name: string, surface: string) => ({ name, surface });

const OBERFLAECHE = [
  tool("period_summary", "Period summary|{}"),
  tool("set_training_goal", "Set training goal|{validFrom: Omit to start at the next midnight}"),
];

describe("computeToolSurfaceFingerprint", () => {
  it("dieselbe Oberfläche ergibt denselben Wert", () => {
    expect(computeToolSurfaceFingerprint(OBERFLAECHE)).toBe(computeToolSurfaceFingerprint(OBERFLAECHE));
  });

  it("die Registrierungs-Reihenfolge ändert ihn nicht", () => {
    // Sonst meldete ein blosses Verschieben eines Blocks in route.ts allen Sitzungen „veraltet".
    expect(computeToolSurfaceFingerprint([...OBERFLAECHE].reverse()))
      .toBe(computeToolSurfaceFingerprint(OBERFLAECHE));
  });

  it("eine geänderte BESCHREIBUNG ändert ihn — der Fall, für den es ihn gibt", () => {
    // Genau der Vorfall vom 23.08.2026: der Aufruf startete längst an der nächsten Mitternacht,
    // die Beschreibung in der offenen Sitzung sagte weiter „Starts now by default".
    const vorher = [tool("set_training_goal", "Set training goal|{validFrom: Omit to start now}"), OBERFLAECHE[0]];
    expect(computeToolSurfaceFingerprint(vorher)).not.toBe(computeToolSurfaceFingerprint(OBERFLAECHE));
  });

  it("ein zusätzliches Werkzeug ändert ihn", () => {
    // Der Bildersafe schaltet `get_image` frei — eine Sitzung von davor kennt es nicht.
    expect(computeToolSurfaceFingerprint([...OBERFLAECHE, tool("get_image", "Read an entry image|{}")]))
      .not.toBe(computeToolSurfaceFingerprint(OBERFLAECHE));
  });

  it("zwei Werkzeuge, deren Text sich nur anders auf sie verteilt, sind NICHT gleich", () => {
    // Der Name geht mit in den verdichteten Text ein, sonst kollidierten Umbenennungen mit
    // Beschreibungs-Änderungen: „ab" + „c" und „a" + „bc" dürfen nicht denselben Wert ergeben.
    expect(computeToolSurfaceFingerprint([tool("ab", "c")])).not.toBe(computeToolSurfaceFingerprint([tool("a", "bc")]));
  });

  it("ist kurz genug, um im Instructions-Text nicht zu stören", () => {
    expect(computeToolSurfaceFingerprint(OBERFLAECHE)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("toolSurfaceFingerprint", () => {
  // Der Wert ist Modul-Zustand. Ohne Rücksetzen hinge das Ergebnis davon ab, welcher Test zuerst
  // lief — grün oder rot aus einem Grund, der nichts mit dem Code zu tun hat.
  beforeEach(() => setToolSurfaceFingerprint("unknown"));

  it("meldet „unknown\", solange der Handler nicht gebaut ist", () => {
    // Vor dem ersten Request gibt es keine verbundene Sitzung, die vergleichen könnte.
    expect(toolSurfaceFingerprint()).toBe("unknown");
  });

  it("gibt danach den gesetzten Stand zurück", () => {
    setToolSurfaceFingerprint("abc123def456");
    expect(toolSurfaceFingerprint()).toBe("abc123def456");
  });
});
