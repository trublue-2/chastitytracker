import { describe, it, expect } from "vitest";
import { missedWeightBlocks, missedWeightRef } from "./weightObligation";
import { dayNumber } from "./weight";

/** Testfassung der Zeitzonen-Helfer: UTC, damit die Rechnung selbst geprüft wird und nicht `Intl`. */
const addDays = (dayKey: string, offset: number): string =>
  new Date((dayNumber(dayKey) + offset) * 86_400_000).toISOString().slice(0, 10);
const endOfDay = (dayKey: string): Date => new Date((dayNumber(dayKey) + 1) * 86_400_000);

const FROM = "2026-08-01";
/** Weit nach allen geprüften Tagen — „läuft noch" wird eigens getestet. */
const SPAeTER = new Date("2026-12-31T00:00:00Z");

function blocks(reported: string[], toDayKey: string, extra: Partial<Parameters<typeof missedWeightBlocks>[0]> = {}) {
  return missedWeightBlocks({
    reportedDayKeys: reported, fromDayKey: FROM, toDayKey, now: SPAeTER, endOfDay, addDays, ...extra,
  });
}

describe("missedWeightBlocks", () => {
  it("zählt nichts, solange täglich gemeldet wird", () => {
    const reported = Array.from({ length: 10 }, (_, i) => addDays(FROM, i));
    expect(blocks(reported, addDays(FROM, 9))).toEqual([]);
  });

  it("lässt zwei ausgelassene Tage durchgehen — die Nachsicht ist der Sinn der Frist", () => {
    // 01. gemeldet, 02.+03. nicht, 04. wieder.
    expect(blocks([FROM, addDays(FROM, 3)], addDays(FROM, 3))).toEqual([]);
  });

  it("erzeugt beim dritten Tag ohne Meldung genau ein Vergehen", () => {
    const result = blocks([FROM], addDays(FROM, 3));
    expect(result).toHaveLength(1);
    expect(result[0].dayKey).toBe(addDays(FROM, 3));
    expect(result[0].days).toBe(3);
  });

  it("setzt den Zähler bei jeder Meldung zurück", () => {
    // Zwei Lücken von je zwei Tagen, dazwischen gemeldet → kein voller Block.
    const reported = [FROM, addDays(FROM, 3), addDays(FROM, 6)];
    expect(blocks(reported, addDays(FROM, 6))).toEqual([]);
  });

  it("macht aus dreissig Tagen Schweigen zehn Vergehen, nicht eines und nicht achtundzwanzig", () => {
    expect(blocks([], addDays(FROM, 29))).toHaveLength(10);
  });

  it("zählt einen Block erst, wenn sein letzter Tag vorbei ist", () => {
    const dritterTag = addDays(FROM, 2);
    // Mitten am dritten Tag: das Versäumnis steht noch nicht fest, er kann heute noch melden.
    const mittags = new Date(endOfDay(dritterTag).getTime() - 12 * 3_600_000);
    expect(blocks([], dritterTag, { now: mittags })).toEqual([]);
    // Eine Minute nach Mitternacht schon.
    const danach = new Date(endOfDay(dritterTag).getTime() + 60_000);
    expect(blocks([], dritterTag, { now: danach })).toHaveLength(1);
  });

  it("setzt die Pflicht bei aktivem Gesundheits-Halt aus, ohne den Zähler zu löschen", () => {
    // Tag 0 und 1 ohne Meldung, Tag 2 im Halt, Tag 3 wieder ohne Meldung → erst hier ist der Block voll.
    const pausiert = [addDays(FROM, 2)];
    const result = blocks([], addDays(FROM, 3), { pausedDayKeys: pausiert });
    expect(result).toHaveLength(1);
    expect(result[0].dayKey).toBe(addDays(FROM, 3));
  });

  it("erzeugt während eines durchgehenden Halts gar nichts", () => {
    const alleTage = Array.from({ length: 10 }, (_, i) => addDays(FROM, i));
    expect(blocks([], addDays(FROM, 9), { pausedDayKeys: alleTage })).toEqual([]);
  });

  it("beginnt nicht vor dem Stichtag", () => {
    // Der Zeitraum umfasst nur zwei Tage — vor `fromDayKey` wird nichts geprüft, auch wenn davor
    // nie gemeldet wurde.
    expect(blocks([], addDays(FROM, 1))).toEqual([]);
  });
});

describe("missedWeightRef", () => {
  it("hat einen eigenen Namensraum, damit nichts mit einer Eintrags-Id kollidiert", () => {
    expect(missedWeightRef("2026-08-22")).toBe("weight-missed:2026-08-22");
  });
});
