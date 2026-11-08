import { describe, it, expect } from "vitest";
import {
  checkJournalInput,
  durationsAt,
  journalRangeFromQuery,
  parseMood,
  storedPrompt,
  toKeyholderView,
  type JournalRow,
} from "./journal";
import type { Session } from "@/lib/sessionModel";

const NOW = new Date("2026-10-16T20:00:00Z");
const H = 3_600_000;

describe("checkJournalInput", () => {
  const ok = { entryAt: new Date("2026-10-16T19:00:00Z"), text: "  Ruhiger Tag.  ", mood: 4 };

  it("beschneidet den Text an den Rändern und übernimmt Stimmung und Zeitpunkt", () => {
    expect(checkJournalInput(ok, NOW)).toEqual({ entryAt: ok.entryAt, text: "Ruhiger Tag.", mood: 4 });
  });

  it("ein einzelner Punkt genügt, Leerraum nicht", () => {
    expect(checkJournalInput({ ...ok, text: "." }, NOW)).toMatchObject({ text: "." });
    expect(checkJournalInput({ ...ok, text: "   \n " }, NOW)).toBe("JOURNAL_TEXT_REQUIRED");
    expect(checkJournalInput({ ...ok, text: 42 }, NOW)).toBe("JOURNAL_TEXT_REQUIRED");
  });

  it("lehnt zu lange Texte ab", () => {
    expect(checkJournalInput({ ...ok, text: "x".repeat(20_001) }, NOW)).toBe("JOURNAL_TEXT_TOO_LONG");
  });

  it("erlaubt Rückdatieren, aber keinen Zeitpunkt in der Zukunft (über die Uhren-Toleranz hinaus)", () => {
    expect(checkJournalInput({ ...ok, entryAt: new Date("2025-03-12T21:05:00Z") }, NOW)).not.toBeTypeOf("string");
    expect(checkJournalInput({ ...ok, entryAt: new Date(NOW.getTime() + 60_000) }, NOW)).not.toBeTypeOf("string");
    expect(checkJournalInput({ ...ok, entryAt: new Date(NOW.getTime() + H) }, NOW)).toBe("TIME_IN_FUTURE");
  });

  it("ein unlesbares Datum ist ein ungültiger Zeitpunkt, keine Zukunft — auch null", () => {
    expect(checkJournalInput({ ...ok, entryAt: new Date("kaputt") }, NOW)).toBe("INVALID_DATETIME");
    expect(checkJournalInput({ ...ok, entryAt: "gestern" }, NOW)).toBe("INVALID_DATETIME");
    expect(checkJournalInput({ ...ok, entryAt: null }, NOW)).toBe("INVALID_DATETIME");
  });

  it("ohne Zeitpunkt gilt jetzt, ein ISO-Text wird gelesen", () => {
    expect(checkJournalInput({ text: "x", mood: null }, NOW)).toMatchObject({ entryAt: NOW });
    expect(checkJournalInput({ ...ok, entryAt: "2026-03-12T21:05:00Z" }, NOW))
      .toMatchObject({ entryAt: new Date("2026-03-12T21:05:00Z") });
  });

  it("Stimmung ist optional, sonst eine ganze Zahl 1–5", () => {
    expect(checkJournalInput({ ...ok, mood: null }, NOW)).toMatchObject({ mood: null });
    expect(checkJournalInput({ ...ok, mood: 0 }, NOW)).toBe("JOURNAL_INVALID_MOOD");
    expect(checkJournalInput({ ...ok, mood: 6 }, NOW)).toBe("JOURNAL_INVALID_MOOD");
    expect(checkJournalInput({ ...ok, mood: 2.5 }, NOW)).toBe("JOURNAL_INVALID_MOOD");
    expect(checkJournalInput({ ...ok, mood: "3" }, NOW)).toBe("JOURNAL_INVALID_MOOD");
  });
});

describe("parseMood", () => {
  it("unterscheidet „keine Stimmung“ (null) von „ungültig“ (undefined)", () => {
    expect(parseMood(undefined)).toBeNull();
    expect(parseMood(null)).toBeNull();
    expect(parseMood(5)).toBe(5);
    expect(parseMood(9)).toBeUndefined();
  });
});

describe("storedPrompt", () => {
  it("speichert die Frage als Kopie", () => {
    expect(storedPrompt(" Was war heute schwierig? ", true)).toBe("Was war heute schwierig?");
  });

  it("speichert NIE eine Frage, wenn Leitfragen abgeschaltet sind — egal, was der Client schickt", () => {
    expect(storedPrompt("Was war heute schwierig?", false)).toBeNull();
  });

  it("leer oder kein Text = ohne Frage", () => {
    expect(storedPrompt("", true)).toBeNull();
    expect(storedPrompt(undefined, true)).toBeNull();
  });
});

describe("toKeyholderView", () => {
  const row = (visibility: string, id = visibility): JournalRow => ({
    id, entryAt: NOW, text: "geheimer Text", mood: 2, prompt: "Was war heute schwierig?", visibility,
  });

  it("private Einträge fallen ganz heraus — auch als Platzhalter", () => {
    expect(toKeyholderView([row("PRIVATE"), row("FULL")]).map((r) => r.id)).toEqual(["FULL"]);
  });

  it("bei „nur Stimmung“ sieht sie weder Text noch Leitfrage, aber Zeitpunkt und Stimmung", () => {
    expect(toKeyholderView([row("MOOD_ONLY")])).toEqual([
      { id: "MOOD_ONLY", entryAt: NOW, mood: 2, text: null, prompt: null, visibility: "MOOD_ONLY" },
    ]);
  });

  it("bei „alles“ sieht sie den ganzen Eintrag", () => {
    expect(toKeyholderView([row("FULL")])[0]).toMatchObject({ text: "geheimer Text", prompt: "Was war heute schwierig?" });
  });

  it("ein unbekannter Wert gilt als privat", () => {
    expect(toKeyholderView([row("SHARED"), row("")])).toEqual([]);
  });
});

/** Nur die Felder, die `durationsAt` liest — der Rest des Session-Modells ist hier Ballast. */
function session(start: string, segments: [string, string | null][]): Session {
  return {
    start: new Date(start),
    segments: segments.map(([s, e]) => ({ start: new Date(s), end: e ? new Date(e) : null })),
  } as unknown as Session;
}

describe("durationsAt", () => {
  // Verschluss 10.10. 08:00, Reinigung 12.10. 08:00–08:30, offen bis heute.
  const running = session("2026-10-10T08:00:00Z", [
    ["2026-10-10T08:00:00Z", "2026-10-12T08:00:00Z"],
    ["2026-10-12T08:30:00Z", null],
  ]);
  const earlier = session("2026-10-01T08:00:00Z", [["2026-10-01T08:00:00Z", "2026-10-05T08:00:00Z"]]);
  const orgasms = [new Date("2026-09-20T10:00:00Z"), new Date("2026-10-06T10:00:00Z")];

  it("zählt die Tragezeit bis zum Zeitpunkt, Reinigungspausen abgezogen", () => {
    const at = new Date("2026-10-13T08:30:00Z");
    // 48 h vor der Pause + 24 h danach
    expect(durationsAt(at, [running, earlier], orgasms).lockedMs).toBe(72 * H);
  });

  it("mitten in einer Reinigungspause ist er nicht verschlossen", () => {
    expect(durationsAt(new Date("2026-10-12T08:15:00Z"), [running], orgasms).lockedMs).toBeNull();
  });

  it("zwischen zwei Sessions und vor der ersten ist er nicht verschlossen", () => {
    expect(durationsAt(new Date("2026-10-07T12:00:00Z"), [running, earlier], orgasms).lockedMs).toBeNull();
    expect(durationsAt(new Date("2026-09-01T12:00:00Z"), [running, earlier], orgasms).lockedMs).toBeNull();
  });

  it("nimmt die Session mit dem spätesten Beginn — eine verwaiste mit offenem Ende greift nicht mehr", () => {
    const orphan = session("2026-10-08T08:00:00Z", [["2026-10-08T08:00:00Z", null]]);
    const at = new Date("2026-10-11T08:00:00Z");
    expect(durationsAt(at, [orphan, running], orgasms).lockedMs).toBe(24 * H);
  });

  it("orgasmusfrei = seit dem letzten Orgasmus VOR dem Zeitpunkt", () => {
    expect(durationsAt(new Date("2026-10-06T22:00:00Z"), [], orgasms).orgasmFreeMs).toBe(12 * H);
    expect(durationsAt(new Date("2026-10-01T10:00:00Z"), [], orgasms).orgasmFreeMs).toBe(11 * 24 * H);
  });

  it("vor dem ersten erfassten Orgasmus gibt es keine Angabe", () => {
    expect(durationsAt(new Date("2026-09-01T00:00:00Z"), [], orgasms).orgasmFreeMs).toBeNull();
  });
});

describe("journalRangeFromQuery", () => {
  const q = (p: Record<string, string>) => new URLSearchParams(p);
  it("ein Monat beginnt um Mitternacht in der Zeitzone des Subs", () => {
    const r = journalRangeFromQuery(q({ month: "2026-03" }), "Europe/Zurich");
    expect(r.from?.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    // Ende März ist schon Sommerzeit
    expect(r.to?.toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });

  it("Dezember läuft ins nächste Jahr über", () => {
    expect(journalRangeFromQuery(q({ month: "2026-12" }), "UTC").to?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("ein Tag grenzt auf diesen Kalendertag ein, ein Tag ausserhalb des Monats gilt nicht", () => {
    const r = journalRangeFromQuery(q({ month: "2026-03", day: "12" }), "UTC");
    expect(r.from?.toISOString()).toBe("2026-03-12T00:00:00.000Z");
    expect(r.to?.toISOString()).toBe("2026-03-13T00:00:00.000Z");
    expect(journalRangeFromQuery(q({ month: "2026-02", day: "30" }), "UTC").to?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("unlesbare Werte gelten als nicht angegeben", () => {
    expect(journalRangeFromQuery(q({ month: "2026-13" }), "UTC")).toEqual({});
    expect(journalRangeFromQuery(q({ month: "0026-03" }), "UTC")).toEqual({});
    expect(journalRangeFromQuery(q({ month: "März" }), "UTC")).toEqual({});
    expect(journalRangeFromQuery(q({}), "UTC")).toEqual({});
  });
});
