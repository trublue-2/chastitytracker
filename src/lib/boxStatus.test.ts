import { describe, it, expect } from "vitest";
import { boxPendingTransition, type BoxRow } from "./boxStatus";

// Der Übergangs-Zustand (Präsenz-Gate, FW ≥ 0.2.34) speist die Box-Karte aus zwei nahtlos
// ineinander übergehenden Quellen: sofort nach dem Eintrag das tracker-lokale pendingCommand,
// nach dem Box-Sync der Soll/Ist-Mismatch des Spiegels. Realer Vorfall 17.07: ohne diese Anzeige
// blieb die Karte bis zum Knopfdruck beim alten Stand („kein Verschluss verlangt").
const row = (over: Partial<BoxRow>): BoxRow => ({
  boxId: "b1",
  name: "Box",
  locked: false,
  reportedLocked: false,
  pendingCommand: null,
  simpleLock: false,
  keyholderLocked: false,
  lockUntil: null,
  lastSyncAt: null,
  ...over,
});

describe("boxPendingTransition", () => {
  it("pendingCommand=lock → closing, noch bevor der Spiegel etwas weiss", () => {
    expect(boxPendingTransition(row({ pendingCommand: "lock" }))).toBe("closing");
  });

  it("pendingCommand=open → opening, auch wenn der Spiegel noch SOLL zu meldet", () => {
    expect(boxPendingTransition(row({ pendingCommand: "open", locked: true, reportedLocked: true }))).toBe("opening");
  });

  it("Spiegel-Mismatch SOLL zu / IST offen → closing (wartet auf Knopf)", () => {
    expect(boxPendingTransition(row({ locked: true, reportedLocked: false }))).toBe("closing");
  });

  it("Spiegel-Mismatch SOLL offen / IST zu → opening (scharfgestellt)", () => {
    expect(boxPendingTransition(row({ locked: false, reportedLocked: true }))).toBe("opening");
  });

  it("Soll=Ist (beide zu / beide offen) → kein Übergang", () => {
    expect(boxPendingTransition(row({ locked: true, reportedLocked: true }))).toBeNull();
    expect(boxPendingTransition(row({ locked: false, reportedLocked: false }))).toBeNull();
  });

  it("Alt-Zeile ohne IST-Meldung → kein Mismatch ableitbar, kein Übergang", () => {
    expect(boxPendingTransition(row({ locked: true, reportedLocked: null }))).toBeNull();
  });
});
