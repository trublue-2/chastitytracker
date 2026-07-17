import { describe, it, expect } from "vitest";
import { buildSessions, isUnassignedDevice, type SegmentEntry } from "./sessionModel";

/**
 * A-04 (MCP-Befundliste 2026-07-17): ein Segment ohne deklariertes Gerät UND ohne verwertbare
 * Bildkontrolle fiel bisher auf `deviceConfidence: "declared"` zurück — sah aus wie eine saubere
 * Angabe, obwohl gar keine vorlag. Jetzt "undeclared".
 */

const NOW = new Date("2026-07-17T12:00:00Z");
const reinigung = { erlaubt: false, maxMinuten: 15 };

let seq = 0;
const entry = (type: string, iso: string, device: { id?: string | null; name?: string | null; categoryId?: string | null } | null): SegmentEntry => ({
  id: `e${++seq}`,
  type,
  startTime: new Date(iso),
  oeffnenGrund: null,
  kontrollCode: null,
  verifikationStatus: null,
  deviceCheck: null,
  deviceCheckNote: null,
  deviceCheckExpected: null,
  device,
});

describe("deviceConfidence — undeclared vs. declared (A-04)", () => {
  it("VERSCHLUSS ohne Gerät und ohne Kontrolle → undeclared, nicht declared", () => {
    const sessions = buildSessions([entry("VERSCHLUSS", "2026-07-17T00:00:00Z", null)], reinigung, NOW);
    const seg = sessions[0].segments[0];
    expect(isUnassignedDevice(seg.deviceDeclared)).toBe(true);
    expect(seg.deviceConfidence).toBe("undeclared");
  });

  it("VERSCHLUSS MIT Gerät und ohne Kontrolle bleibt declared (Regression)", () => {
    const sessions = buildSessions([entry("VERSCHLUSS", "2026-07-17T00:00:00Z", { id: "d1", name: "Flatty", categoryId: null })], reinigung, NOW);
    const seg = sessions[0].segments[0];
    expect(seg.deviceConfidence).toBe("declared");
  });
});
