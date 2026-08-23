import { describe, it, expect } from "vitest";
import { dueWeighingReminder, reminderMark } from "./weightReminder";
import { ALL_WEEKDAYS, weekdayMaskOf } from "./weekdays";

const w = (start: string, durationMin: number, over: Partial<{ days: number; remind: boolean }> = {}) =>
  ({ start, durationMin, days: ALL_WEEKDAYS, remind: true, ...over });

// 06:00 UTC = 08:00 Zürich (Sommerzeit) — mitten in einem Fenster von 06:00 bis 09:00.
const IM_FENSTER = new Date("2026-08-22T06:00:00Z");
const TZ = "Europe/Zurich";
const DAY = "2026-08-22";

const base = { at: IM_FENSTER, tz: TZ, dayKey: DAY, mark: null };

describe("dueWeighingReminder", () => {
  it("erinnert im laufenden Fenster", () => {
    expect(dueWeighingReminder({ ...base, windows: [w("06:00", 180)] })?.start).toBe("06:00");
  });

  it("schweigt vor und nach dem Fenster", () => {
    const spaeter = new Date("2026-08-22T09:00:00Z"); // 11:00 Zürich
    expect(dueWeighingReminder({ ...base, at: spaeter, windows: [w("06:00", 180)] })).toBeNull();
  });

  it("schweigt an einem Wochentag, an dem das Fenster nicht gilt", () => {
    // Der 22.08.2026 ist ein Samstag.
    const werktags = [w("06:00", 180, { days: weekdayMaskOf([1, 2, 3, 4, 5]) })];
    expect(dueWeighingReminder({ ...base, windows: werktags })).toBeNull();
  });

  it("schweigt bei einem Fenster ohne Erinnerung", () => {
    expect(dueWeighingReminder({ ...base, windows: [w("06:00", 180, { remind: false })] })).toBeNull();
  });

  it("erinnert je Fenster und Tag nur einmal", () => {
    const windows = [w("06:00", 180)];
    const mark = reminderMark(DAY, windows[0]);
    expect(dueWeighingReminder({ ...base, mark, windows })).toBeNull();
    // Die Marke von gestern hält heute nicht.
    expect(dueWeighingReminder({ ...base, mark: reminderMark("2026-08-21", windows[0]), windows })?.start)
      .toBe("06:00");
  });

  it("erinnert an ein ZWEITES Fenster desselben Tages erneut", () => {
    // Die Marke hängt an der Startzeit, nicht am Listen-Index: wer das erste Fenster löscht,
    // bekommt für das zweite trotzdem noch seine Erinnerung.
    const windows = [w("06:00", 180), w("18:00", 120)];
    const abends = new Date("2026-08-22T16:30:00Z"); // 18:30 Zürich
    const mark = reminderMark(DAY, windows[0]);
    expect(dueWeighingReminder({ ...base, at: abends, mark, windows })?.start).toBe("18:00");
  });
});
