import { describe, it, expect } from "vitest";
import { boxHoldOutlook, type BoxHoldParams } from "./boxOpenOutlook";

const NOW = new Date("2026-07-10T12:24:00+02:00");

const base: BoxHoldParams = { sperrzeit: null, box: null, now: NOW };

describe("boxHoldOutlook", () => {
  it("ohne Box gibt es nichts vorherzusagen", () => {
    expect(boxHoldOutlook(base)).toBeNull();
    // auch nicht bei laufender Sperrzeit — ohne Hardware ist der Eintrag die ganze Wahrheit
    expect(boxHoldOutlook({ ...base, sperrzeit: { endetAt: null, unbefristet: true } })).toBeNull();
  });

  it("Box ohne eigene Frist: der Riegel folgt", () => {
    expect(boxHoldOutlook({ ...base, box: { lockUntil: null } })).toBeNull();
  });

  it("DER STILLE FALL: die Box hält ihre Frist, obwohl der Tracker `open` sendet", () => {
    // Reale Lage am 10.07. um 12:24: Sperrzeit bis 17:19 mit reinigungErlaubt=true. Eine
    // Reinigungsöffnung bricht nichts, der Tracker sendet brav `open` — und nichts passiert.
    expect(boxHoldOutlook({
      ...base,
      sperrzeit: { endetAt: "2026-07-10T17:19:48+02:00", unbefristet: false },
      box: { lockUntil: "2026-07-10T17:19:48+02:00" },
    })).toEqual({ until: "2026-07-10T17:19:48+02:00" });
  });

  it("nach Ablauf der Box-Frist folgt der Riegel", () => {
    expect(boxHoldOutlook({ ...base, box: { lockUntil: "2026-07-10T11:00:00+02:00" } })).toBeNull();
  });

  it("REGRESSION: unbefristete Sperrzeit — die Box hält, obwohl es kein endetAt gibt", () => {
    // `box.lockUntil` kann hier null sein (kein Enddatum zum Falten). Wer nur aufs Datum schaut,
    // meldet „öffnet" — und beruhigt genau dann falsch, wenn die Box am längsten hält.
    expect(boxHoldOutlook({
      ...base,
      sperrzeit: { endetAt: null, unbefristet: true },
      box: { lockUntil: null },
    })).toEqual({ until: null });
  });

  it("unbefristete Sperrzeit: der von der Box gemeldete Hard-Cap gewinnt nicht über `bis auf Weiteres`", () => {
    // Heimdall faltet eine unbefristete Sperre auf seinen hardCap. Dem Sub „hält bis 20:00" zu
    // zeigen, wäre eine Zusage, die die Keyholderin nie gemacht hat.
    expect(boxHoldOutlook({
      ...base,
      sperrzeit: { endetAt: null, unbefristet: true },
      box: { lockUntil: "2026-07-11T20:00:00+02:00" },
    })).toEqual({ until: null });
  });

  it("eine ABGELAUFENE Sperrzeit hält nichts mehr — es zählt allein die Box-Frist", () => {
    expect(boxHoldOutlook({
      ...base,
      sperrzeit: { endetAt: "2026-07-10T11:00:00+02:00", unbefristet: false },
      box: { lockUntil: "2026-07-10T11:00:00+02:00" },
    })).toBeNull();
  });

  it("Sperrzeit abgelaufen, Box hält trotzdem (eigene Frist) → sie hält", () => {
    expect(boxHoldOutlook({
      ...base,
      sperrzeit: { endetAt: "2026-07-10T11:00:00+02:00", unbefristet: false },
      box: { lockUntil: "2026-07-10T18:00:00+02:00" },
    })).toEqual({ until: "2026-07-10T18:00:00+02:00" });
  });
});
