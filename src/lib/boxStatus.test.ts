import { describe, it, expect } from "vitest";
import { boxPendingTransition, boxSollLabel, boxSollLocked, type BoxRow } from "./boxStatus";

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

// Vorfall 24.07: nach einer eingetragenen Öffnung zeigte die Karte 5 Minuten lang „Soll:
// verschlossen, ohne Zeitlimit" samt Konflikt-Warnung — der Spiegel stand noch auf dem Push von
// VOR dem Eintrag, während daneben schon „Öffnung freigegeben" stand. Das SOLL muss demselben
// Vorrang folgen wie der Übergang: das anstehende Kommando ist die jüngere Absicht.
describe("boxSollLocked — anstehendes Kommando vor gespiegeltem SOLL", () => {
  const t = (key: string) => key;
  const fmt = (iso: string) => iso;

  it("anstehendes open entwertet den gespiegelten SOLL", () => {
    const b = row({ pendingCommand: "open", simpleLock: true, locked: true });
    expect(boxSollLocked(b)).toBe(false);
    expect(boxSollLabel(b, t, fmt)).toBe("sollNone");
  });

  // Die Sperrzeit wird von /api/box bei jedem Poll live aus der Tracker-DB überlagert, ist also
  // NICHT der veraltete Spiegel — ein Kommando darf sie nie überschreiben. Sonst versteckte eine
  // Box, die nach dem open nie wieder synct, die Keyholder-Sperre dauerhaft (pendingCommand löscht
  // nur der Box-Sync).
  it("anstehendes open schlägt die Keyholder-Sperre NICHT", () => {
    expect(boxSollLocked(row({ pendingCommand: "open", keyholderLocked: true }))).toBe(true);
    expect(boxSollLocked(row({ pendingCommand: "open", lockUntil: "2026-07-24T20:00:00.000Z" }))).toBe(true);
  });

  it("… auch nicht in Kombination mit einem veralteten simpleLock", () => {
    const b = row({ pendingCommand: "open", keyholderLocked: true, simpleLock: true, locked: true });
    expect(boxSollLocked(b)).toBe(true);
    expect(boxSollLabel(b, t, fmt)).toBe("sollLockedIndefinite");
  });

  it("anstehendes lock erfindet KEIN Soll — die Details kennt erst der nächste Push", () => {
    const b = row({ pendingCommand: "lock" });
    expect(boxSollLocked(b)).toBe(false);
    expect(boxSollLabel(b, t, fmt)).toBe("sollNone");
  });

  // Ein Sperrbruch erzeugt gar kein open-Kommando (boxCommandForEntry → null), der Spiegel bleibt
  // also stehen — genau der Fall, für den die Konflikt-Warnung gedacht ist, verstummt nicht.
  it("gebrochene Sperrzeit (kein Kommando gesetzt) lässt den SOLL stehen", () => {
    expect(boxSollLocked(row({ pendingCommand: null, keyholderLocked: true }))).toBe(true);
  });

  it("ohne anstehendes Kommando gilt der Spiegel unverändert", () => {
    expect(boxSollLabel(row({ simpleLock: true }), t, fmt)).toBe("sollIndefinite");
    expect(boxSollLabel(row({ keyholderLocked: true }), t, fmt)).toBe("sollLockedIndefinite");
    expect(boxSollLabel(row({ keyholderLocked: true, lockUntil: "x" }), t, fmt)).toBe("sollLockedUntil");
    expect(boxSollLabel(row({ lockUntil: "x" }), t, fmt)).toBe("sollUntil");
    expect(boxSollLabel(row({}), t, fmt)).toBe("sollNone");
  });
});
