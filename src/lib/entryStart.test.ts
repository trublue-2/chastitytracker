import { describe, it, expect } from "vitest";
import { resolveEntryStart, startAfter, startIsNow } from "./entryStart";

const at = (iso: string) => new Date(iso);

describe("startIsNow", () => {
  it("gilt nur für Verschluss und Öffnen, nur mit gesetztem Flag und nur online", () => {
    expect(startIsNow({ startIsNow: true }, "VERSCHLUSS", false)).toBe(true);
    expect(startIsNow({ startIsNow: true }, "OEFFNEN", false)).toBe(true);
    expect(startIsNow({}, "VERSCHLUSS", false)).toBe(false);
    expect(startIsNow({ startIsNow: "true" }, "VERSCHLUSS", false)).toBe(false);
    expect(startIsNow({ startIsNow: true }, "PRUEFUNG", false)).toBe(false);
    expect(startIsNow({ startIsNow: true }, "WEAR_BEGIN", false)).toBe(false);
  });

  it("ein offline erfasster Eintrag behält die Erfassungszeit des Clients", () => {
    expect(startIsNow({ startIsNow: true }, "VERSCHLUSS", true)).toBe(false);
  });
});

describe("resolveEntryStart", () => {
  const now = at("2026-10-06T10:06:24.500Z");

  it("nimmt bei „jetzt\" die Server-Uhr samt Sekunden", () => {
    expect(resolveEntryStart({ capturedAt: null, startTime: "2026-10-06T10:06:00.000Z", isNow: true, now })).toEqual(now);
  });

  it("nimmt sonst die Formular-Zeit (minutengenau)", () => {
    expect(resolveEntryStart({ capturedAt: null, startTime: "2026-10-06T10:06:00.000Z", isNow: false, now }))
      .toEqual(at("2026-10-06T10:06:00.000Z"));
  });

  it("offline gewinnt die Erfassungszeit des Clients, auch wenn das Flag mitkam", () => {
    const captured = at("2026-10-06T09:00:30.000Z");
    expect(resolveEntryStart({ capturedAt: captured, startTime: "2026-10-06T10:06:00.000Z", isNow: true, now })).toEqual(captured);
  });
});

describe("startAfter", () => {
  const previous = at("2026-10-06T10:06:10.865Z");

  it("„jetzt\" nach dem vorherigen Eintrag bleibt unverändert", () => {
    const now = at("2026-10-06T10:06:24.000Z");
    expect(startAfter(now, previous, true)).toBe(now);
  });

  it("„jetzt\" auf oder vor dem vorherigen rückt eine Millisekunde dahinter, statt abzuweisen", () => {
    expect(startAfter(previous, previous, true)).toEqual(at("2026-10-06T10:06:10.866Z"));
    expect(startAfter(at("2026-10-06T10:06:10.000Z"), previous, true)).toEqual(at("2026-10-06T10:06:10.866Z"));
  });

  it("eine von Hand gewählte Zeit wird nie verschoben — die Reihenfolge-Prüfung entscheidet", () => {
    const manual = at("2026-10-06T10:06:00.000Z");
    expect(startAfter(manual, previous, false)).toBe(manual);
  });
});
