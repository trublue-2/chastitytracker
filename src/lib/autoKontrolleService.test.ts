import { describe, it, expect } from "vitest";
import { hhmmToMinutes, isInQuietMinutes, generateAutoKontrollen, repairAutoKontrollen, type AutoKontrolleSettings, type PlannedAutoKontrolle } from "./autoKontrolleService";
import { dateAtLocalMinutes, midnightInTZ } from "./utils";

describe("hhmmToMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("06:00")).toBe(360);
    expect(hhmmToMinutes("22:00")).toBe(1320);
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });
});

describe("isInQuietMinutes (wrap-aware)", () => {
  it("handles a midnight-wrapping window (22:00–06:00)", () => {
    const von = 1320, bis = 360; // 22:00 .. 06:00
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("23:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("05:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("22:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("06:00"))).toBe(false); // Ende exklusiv
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("12:00"))).toBe(false);
  });
  it("handles a same-day window (01:00–05:00)", () => {
    const von = 60, bis = 300;
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("02:00"))).toBe(true);
    expect(isInQuietMinutes(von, bis, hhmmToMinutes("12:00"))).toBe(false);
  });
  it("empty window (von == bis) is never quiet", () => {
    expect(isInQuietMinutes(360, 360, 360)).toBe(false);
  });
});

describe("generateAutoKontrollen", () => {
  // now = CH-Mitternacht → das ganze Wach-Fenster liegt in der Zukunft (alle Slots werden behalten).
  const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"));
  const dayBase = midnightInTZ(now).getTime();
  // Min == Max ⇒ fixe Anzahl (Verhalten wie vor der Min–Max-Erweiterung).
  const base: AutoKontrolleSettings = { aktiv: true, perDayMin: 4, perDayMax: 4, ruheVon: "22:00", ruheBis: "06:00", fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "" };

  const deadlineMin = (s: { deadline: Date }) => Math.round((s.deadline.getTime() - dayBase) / 60_000);
  const durationMin = (s: { wirksamAb: Date; deadline: Date }) => Math.round((s.deadline.getTime() - s.wirksamAb.getTime()) / 60_000);

  it("returns 0 slots when max is 0", () => {
    expect(generateAutoKontrollen({ ...base, perDayMin: 0, perDayMax: 0 }, now)).toHaveLength(0);
  });

  it("respects perDayMin count and all constraints (standard 22–06 window)", () => {
    const slots = generateAutoKontrollen(base, now, () => 0.5);
    expect(slots.length).toBeLessThanOrEqual(base.perDayMax);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      // Frist im Wach-Fenster (NICHT im Schlaf-Fenster 22–06)
      expect(isInQuietMinutes(1320, 360, deadlineMin(s))).toBe(false);
      // Erfüllungsdauer im konfigurierten Bereich
      const dur = durationMin(s);
      expect(dur).toBeGreaterThanOrEqual(base.fristVon);
      expect(dur).toBeLessThanOrEqual(base.fristBis);
      // nur Zukunft
      expect(s.wirksamAb.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("produces non-overlapping inspections (sorted by trigger)", () => {
    const slots = generateAutoKontrollen(base, now, () => 0.5).sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(slots[i - 1].deadline.getTime());
    }
  });

  it("works with extreme rand values (0 and ~1)", () => {
    for (const r of [0, 0.999999]) {
      const slots = generateAutoKontrollen(base, now, () => r);
      for (const s of slots) {
        expect(isInQuietMinutes(1320, 360, deadlineMin(s))).toBe(false);
        expect(durationMin(s)).toBeGreaterThanOrEqual(base.fristVon);
      }
    }
  });
});

describe("generateAutoKontrollen — zufällige Tages-Anzahl aus [Min, Max]", () => {
  // now = CH-Mitternacht → ganzer Tag Zukunft, Segmente gross genug → slots.length == gewürfelte Anzahl.
  const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"));
  const range: AutoKontrolleSettings = { aktiv: true, perDayMin: 2, perDayMax: 6, ruheVon: "22:00", ruheBis: "06:00", fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "" };

  it("rand→0 wählt die Min-Anzahl", () => {
    expect(generateAutoKontrollen(range, now, () => 0)).toHaveLength(2);
  });

  it("rand→1 wählt die Max-Anzahl", () => {
    expect(generateAutoKontrollen(range, now, () => 0.999999)).toHaveLength(6);
  });

  it("mittlerer rand-Wert wählt einen Wert innerhalb [Min, Max]", () => {
    // Erster rand()-Aufruf bestimmt die Anzahl: 2 + floor(0.5·(6−2+1)) = 2 + floor(2.5) = 4.
    const n = generateAutoKontrollen(range, now, () => 0.5).length;
    expect(n).toBe(4);
    expect(n).toBeGreaterThanOrEqual(range.perDayMin);
    expect(n).toBeLessThanOrEqual(range.perDayMax);
  });

  it("Max < Min wird als Min behandelt (fixe Anzahl, kein Absturz)", () => {
    const settings = { ...range, perDayMin: 5, perDayMax: 2 };
    for (const r of [0, 0.5, 0.999999]) {
      expect(generateAutoKontrollen(settings, now, () => r)).toHaveLength(5);
    }
  });
});

describe("generateAutoKontrollen — per-user timezone anchor", () => {
  const settings: AutoKontrolleSettings = { aktiv: true, perDayMin: 4, perDayMax: 4, ruheVon: "22:00", ruheBis: "06:00", fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "" };

  it("anchors the day + awake window to the given tz (New York)", () => {
    const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"), "America/New_York");
    const slots = generateAutoKontrollen(settings, now, () => 0.5, "America/New_York");
    expect(slots.length).toBeGreaterThan(0);
    const nyMidnight = midnightInTZ(now, "America/New_York").getTime();
    for (const s of slots) {
      const offsetMin = (s.wirksamAb.getTime() - nyMidnight) / 60_000;
      // awake window 06:00–22:00 in NY-local minutes
      expect(offsetMin).toBeGreaterThanOrEqual(360);
      expect(offsetMin).toBeLessThan(1320);
    }
  });

  // rand() === 0 → 4 Segmente à 240min, Trigger jeweils am Segmentanfang: 06:00 / 10:00 / 14:00 / 18:00
  // Ortszeit. Die Slots sind an eine lokale WANDUHR gebunden, nicht an „Mitternacht + N Minuten" —
  // sonst verschöben sich alle Slots an den Umstellungstagen um eine Stunde.
  it.each([
    ["Normaltag", "2026-06-15T12:00:00Z"],
    ["Frühjahrs-Umstellungstag", "2026-03-29T12:00:00Z"],
    ["Herbst-Umstellungstag", "2026-10-25T12:00:00Z"],
  ])("legt die Slots am %s auf dieselbe Ortszeit", (_label, day) => {
    const tz = "Europe/Zurich";
    const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).format(d);
    const slots = generateAutoKontrollen(settings, midnightInTZ(new Date(day), tz), () => 0, tz);
    expect(slots.map((s) => hhmm(s.wirksamAb))).toEqual(["06:00", "10:00", "14:00", "18:00"]);
    expect(slots.map((s) => hhmm(s.deadline))).toEqual(["06:15", "10:15", "14:15", "18:15"]);
  });

  // Auch ein Wach-Fenster, das die Frühjahrs-Lücke (02:00–03:00) oder Mitternacht enthält, darf nie
  // zwei Slots auf denselben Instant legen oder eine Frist in den nächsten Slot ragen lassen.
  it.each(["2026-06-15T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z"])(
    "erzeugt am %s streng aufsteigende, überlappungsfreie Slots (auch über Mitternacht/DST-Lücke)",
    (day) => {
      const tz = "Europe/Zurich";
      for (const [ruheVon, ruheBis] of [["22:00", "06:00"], ["01:30", "00:00"], ["02:00", "20:00"], ["23:00", "01:00"]]) {
        for (let seed = 0; seed < 40; seed++) {
          let n = seed;
          const rand = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
          const slots = generateAutoKontrollen({ ...settings, perDayMin: 6, perDayMax: 6, ruheVon, ruheBis }, midnightInTZ(new Date(day), tz), rand, tz);
          for (let i = 0; i < slots.length; i++) {
            expect(slots[i].deadline.getTime()).toBeGreaterThan(slots[i].wirksamAb.getTime());
            if (i > 0) expect(slots[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(slots[i - 1].deadline.getTime());
          }
        }
      }
    },
  );

  it("default tz === Europe/Zurich (regression: existing users unchanged)", () => {
    const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"), "Europe/Zurich");
    const withDefault = generateAutoKontrollen(settings, now, () => 0.5).map((s) => s.wirksamAb.getTime());
    const withZurich = generateAutoKontrollen(settings, now, () => 0.5, "Europe/Zurich").map((s) => s.wirksamAb.getTime());
    expect(withDefault).toEqual(withZurich);
  });
});

describe("generateAutoKontrollen — festes Auslöse-Fenster", () => {
  const tz = "Europe/Zurich";
  const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"), tz); // ganzer Tag Zukunft
  const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).format(d);
  const win: AutoKontrolleSettings = {
    aktiv: true, perDayMin: 3, perDayMax: 3, ruheVon: "22:00", ruheBis: "06:00",
    fristVon: 15, fristBis: 60, fensterVon: "10:00", fensterBis: "16:00",
  };

  it("legt alle Auslösungen INS Fenster (10:00–16:00), Frist danach", () => {
    for (let seed = 0; seed < 40; seed++) {
      let n = seed;
      const rand = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
      for (const s of generateAutoKontrollen(win, now, rand, tz)) {
        expect(hhmm(s.wirksamAb) >= "10:00" && hhmm(s.wirksamAb) < "16:00").toBe(true);
        expect(s.deadline.getTime()).toBeGreaterThan(s.wirksamAb.getTime());
      }
    }
  });

  it("verteilt die Trigger übers Fenster (3 Segmente à 2h: 10 / 12 / 14 Uhr bei rand→0)", () => {
    const slots = generateAutoKontrollen(win, now, () => 0, tz);
    expect(slots.map((s) => hhmm(s.wirksamAb))).toEqual(["10:00", "12:00", "14:00"]);
  });

  it("kappt die Frist am Schlaf-Beginn, hält aber die Mindest-Frist ein", () => {
    // Fenster 20:00–21:45 (dicht vor Schlaf 22:00): späte Trigger würden über 22:00 laufen und werden
    // auf 21:59 gekappt — aber JEDER erzeugte Slot behält ≥ fristVon (sonst würfe ihn der Replan raus).
    const late: AutoKontrolleSettings = { ...win, perDayMin: 4, perDayMax: 4, fensterVon: "20:00", fensterBis: "21:45", fristVon: 15, fristBis: 90 };
    let emitted = 0;
    for (let seed = 0; seed < 40; seed++) {
      let n = seed;
      const rand = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
      for (const s of generateAutoKontrollen(late, now, rand, tz)) {
        emitted++;
        const dur = Math.round((s.deadline.getTime() - s.wirksamAb.getTime()) / 60_000);
        expect(dur).toBeGreaterThanOrEqual(15);
        expect(dur).toBeLessThanOrEqual(90);
        expect(hhmm(s.deadline) <= "22:00").toBe(true); // nie in den Schlaf
      }
    }
    expect(emitted).toBeGreaterThan(0);
  });

  it("überspringt einen Trigger, für den vor dem Schlaf nicht mehr die volle Mindest-Frist Platz hat", () => {
    // Fenster 21:30–21:59, fristVon 60 → kein Trigger hat 60 Min bis 22:00 → nichts wird erzeugt
    // (statt eines unbrauchbar kurzen Slots, den der Replan sofort wieder löschte).
    const noRoom: AutoKontrolleSettings = { ...win, perDayMin: 2, perDayMax: 2, fensterVon: "21:30", fensterBis: "21:59", fristVon: 60, fristBis: 60 };
    for (const r of [0, 0.5, 0.999999]) {
      expect(generateAutoKontrollen(noRoom, now, () => r, tz)).toHaveLength(0);
    }
  });

  it("überspringt Trigger, die doch ins Schlaf-Fenster fielen (Fenster überlappt Schlaf)", () => {
    // Fenster 20:00–23:00, Schlaf 22:00–06:00 → das Segment ab 22:00 liegt im Schlaf und wird
    // übersprungen; keine Auslösung ab 22:00.
    const overlap: AutoKontrolleSettings = { ...win, perDayMin: 6, perDayMax: 6, fensterVon: "20:00", fensterBis: "23:00" };
    for (const s of generateAutoKontrollen(overlap, now, () => 0.5, tz)) {
      expect(hhmm(s.wirksamAb) < "22:00").toBe(true);
    }
  });

  it("ungültiges Fenster (Von≥Bis oder leer) → Fallback aufs Wach-Fenster (Bestandsverhalten)", () => {
    const fallbackA = generateAutoKontrollen({ ...win, fensterVon: "16:00", fensterBis: "10:00" }, now, () => 0.5, tz);
    const fallbackB = generateAutoKontrollen({ ...win, fensterVon: "", fensterBis: "" }, now, () => 0.5, tz);
    const plain = generateAutoKontrollen({ ...win, fensterVon: "", fensterBis: "" }, now, () => 0.5, tz);
    expect(fallbackA.map((s) => s.wirksamAb.getTime())).toEqual(plain.map((s) => s.wirksamAb.getTime()));
    expect(fallbackB.map((s) => s.wirksamAb.getTime())).toEqual(plain.map((s) => s.wirksamAb.getTime()));
  });

  it("DST-sicher: Fenster-Trigger liegen an denselben Ortszeiten, auch am Umstellungstag", () => {
    for (const day of ["2026-06-15T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z"]) {
      const d = midnightInTZ(new Date(day), tz);
      expect(generateAutoKontrollen(win, d, () => 0, tz).map((s) => hhmm(s.wirksamAb))).toEqual(["10:00", "12:00", "14:00"]);
    }
  });
});

describe("repairAutoKontrollen — festes Auslöse-Fenster", () => {
  const tz = "Europe/Zurich";
  const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"), tz);
  const at = (min: number) => dateAtLocalMinutes(now, min, tz);
  const minuteOf = (d: Date) => Math.round((d.getTime() - midnightInTZ(now, tz).getTime()) / 60_000);
  const win: AutoKontrolleSettings = {
    aktiv: true, perDayMin: 3, perDayMax: 3, ruheVon: "22:00", ruheBis: "06:00",
    fristVon: 15, fristBis: 60, fensterVon: "10:00", fensterBis: "16:00",
  };

  it("zieht einen mittags gesetzten Fenster-Plan hinein: Trigger ausserhalb 10–16 werden ersetzt", () => {
    // Plan wurde noch OHNE Fenster gewürfelt (übers Wach-Fenster verteilt) → die Trigger vor 10:00
    // oder ab 16:00 verletzen das neue Fenster und werden durch In-Fenster-Slots ersetzt.
    const existing = generateAutoKontrollen({ ...win, fensterVon: "", fensterBis: "" }, now, () => 0.5, tz)
      .map((s, i) => ({ ...s, id: `k${i}`, sent: false }));
    const outside = existing.filter((e) => minuteOf(e.wirksamAb) < 600 || minuteOf(e.wirksamAb) > 960).map((e) => e.id);
    expect(outside.length).toBeGreaterThan(0);
    const { deleteIds, create } = repairAutoKontrollen(win, existing, now, () => 0.5, tz);
    expect(deleteIds.sort()).toEqual(outside.sort());
    for (const s of create) {
      expect(minuteOf(s.wirksamAb)).toBeGreaterThanOrEqual(600);
      expect(minuteOf(s.wirksamAb)).toBeLessThanOrEqual(960);
    }
  });

  it("erkennt einen im Fenster gewürfelten Plan als gültig (kein Umbau)", () => {
    const existing = generateAutoKontrollen(win, now, () => 0.3, tz).map((s, i) => ({ ...s, id: `k${i}`, sent: false }));
    expect(repairAutoKontrollen(win, existing, now, () => 0.3, tz)).toEqual({ deleteIds: [], create: [] });
  });

  it("nachgezogene Slots bleiben im Fenster und überlappen nicht", () => {
    const existing = generateAutoKontrollen(win, now, () => 0.3, tz).map((s, i) => ({ ...s, id: `k${i}`, sent: false }));
    const { create } = repairAutoKontrollen({ ...win, perDayMin: 5, perDayMax: 5 }, existing, now, () => 0.5, tz);
    const all = [...existing, ...create].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    for (const s of create) {
      expect(minuteOf(s.wirksamAb)).toBeGreaterThanOrEqual(600);
      expect(minuteOf(s.deadline)).toBeLessThanOrEqual(960);
    }
    for (let i = 1; i < all.length; i++) {
      expect(all[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(all[i - 1].deadline.getTime());
    }
  });
});

describe("repairAutoKontrollen", () => {
  const tz = "Europe/Zurich";
  const now = midnightInTZ(new Date("2026-06-15T12:00:00Z"), tz); // ganzer Tag in der Zukunft
  const base: AutoKontrolleSettings = { aktiv: true, perDayMin: 4, perDayMax: 4, ruheVon: "22:00", ruheBis: "06:00", fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "" };
  const at = (min: number) => dateAtLocalMinutes(now, min, tz);
  const minuteOf = (d: Date) => Math.round((d.getTime() - midnightInTZ(now, tz).getTime()) / 60_000);

  /** Der aktuelle Plan als PlannedAutoKontrolle[] — deterministisch aus generateAutoKontrollen. */
  const plan = (settings = base, sent = 0): PlannedAutoKontrolle[] =>
    generateAutoKontrollen(settings, now, () => 0.5, tz).map((s, i) => ({ ...s, id: `k${i}`, sent: i < sent }));

  it("ändert nichts, wenn der Plan die Settings weiterhin erfüllt", () => {
    expect(repairAutoKontrollen(base, plan(), now, () => 0.5, tz)).toEqual({ deleteIds: [], create: [] });
  });

  it("ändert nichts bei einem reinen Aktiv-Toggle auf einem schon geplanten Tag", () => {
    const existing = plan({ ...base, aktiv: false });
    expect(repairAutoKontrollen(base, existing, now, () => 0.5, tz)).toEqual({ deleteIds: [], create: [] });
  });

  it("löscht die offenen Zeilen beim Deaktivieren, versendete bleiben", () => {
    const { deleteIds, create } = repairAutoKontrollen({ ...base, aktiv: false }, plan(base, 2), now, () => 0.5, tz);
    expect(deleteIds).toEqual(["k2", "k3"]);
    expect(create).toEqual([]);
  });

  it("ersetzt nur die Slots, die das neue Schlaf-Fenster verletzen", () => {
    // Wach-Fenster von 06–22 auf 12–22 verkürzt → die Vormittags-Slots fallen ins Schlaf-Fenster.
    const existing = plan();
    const wide = existing.filter((e) => minuteOf(e.wirksamAb) < 12 * 60).map((e) => e.id);
    expect(wide.length).toBeGreaterThan(0);
    const { deleteIds, create } = repairAutoKontrollen({ ...base, ruheBis: "12:00" }, existing, now, () => 0.5, tz);
    expect(deleteIds).toEqual(wide);
    expect(create).toHaveLength(wide.length); // 1:1 ersetzt (perDayMin bleibt 4)
    for (const s of create) {
      expect(minuteOf(s.wirksamAb)).toBeGreaterThanOrEqual(12 * 60);
      expect(minuteOf(s.deadline)).toBeLessThanOrEqual(22 * 60);
    }
  });

  it("ersetzt Slots, deren Erfüllungsdauer aus dem neuen Frist-Bereich fällt", () => {
    const existing: PlannedAutoKontrolle[] = [
      { id: "short", wirksamAb: at(600), deadline: at(620), sent: false }, // 20 min
      { id: "long", wirksamAb: at(700), deadline: at(790), sent: false },  // 90 min
    ];
    const settings = { ...base, perDayMin: 2, perDayMax: 2, fristVon: 30, fristBis: 60 };
    const { deleteIds, create } = repairAutoKontrollen(settings, existing, now, () => 0.5, tz);
    expect(deleteIds).toEqual(["short", "long"]);
    expect(create).toHaveLength(2);
    for (const s of create) {
      const dur = minuteOf(s.deadline) - minuteOf(s.wirksamAb);
      expect(dur).toBeGreaterThanOrEqual(30);
      expect(dur).toBeLessThanOrEqual(60);
    }
  });

  it("streicht bei gesenktem perDayMax die spätesten offenen Slots", () => {
    const existing = plan(base, 1); // k0 versendet
    const { deleteIds, create } = repairAutoKontrollen({ ...base, perDayMin: 2, perDayMax: 2 }, existing, now, () => 0.5, tz);
    expect(deleteIds).toEqual(["k3", "k2"]); // spätester zuerst
    expect(create).toEqual([]);
  });

  it("zieht bei angehobenem perDayMin überlappungsfrei nach", () => {
    const existing = plan();
    const { deleteIds, create } = repairAutoKontrollen({ ...base, perDayMin: 6, perDayMax: 6 }, existing, now, () => 0.5, tz);
    expect(deleteIds).toEqual([]);
    expect(create).toHaveLength(2);
    const all = [...existing, ...create].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    for (let i = 1; i < all.length; i++) {
      expect(all[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(all[i - 1].deadline.getTime());
    }
  });

  it("plant nichts nach, wenn nur perDayMax angehoben wird (Anzahl war schon gewürfelt)", () => {
    const { deleteIds, create } = repairAutoKontrollen({ ...base, perDayMax: 12 }, plan(), now, () => 0.5, tz);
    expect(deleteIds).toEqual([]);
    expect(create).toEqual([]);
  });

  it("legt nachgezogene Slots nie in die Vergangenheit", () => {
    const noon = dateAtLocalMinutes(now, 12 * 60, tz);
    const existing: PlannedAutoKontrolle[] = [{ id: "a", wirksamAb: at(400), deadline: at(430), sent: true }];
    const { create } = repairAutoKontrollen({ ...base, perDayMin: 3, perDayMax: 3 }, existing, noon, () => 0.5, tz);
    expect(create.length).toBeGreaterThan(0);
    for (const s of create) expect(s.wirksamAb.getTime()).toBeGreaterThan(noon.getTime());
  });

  it("bricht das Nachziehen ab, wenn keine Lücke mehr für fristVon reicht", () => {
    // Wach-Fenster 06:00–07:00 (60 min), fristVon 60 → genau ein Slot passt.
    const settings: AutoKontrolleSettings = { ...base, perDayMin: 5, perDayMax: 5, ruheVon: "07:00", ruheBis: "06:00", fristVon: 60, fristBis: 60 };
    const { create } = repairAutoKontrollen(settings, [{ id: "a", wirksamAb: at(360), deadline: at(400), sent: true }], now, () => 0.5, tz);
    expect(create).toHaveLength(0); // Rest-Lücke 400–420 < 60 min
  });
});

describe("repairAutoKontrollen — gemeinsame Minuten-Achse mit generateAutoKontrollen", () => {
  const tz = "Europe/Zurich";
  const settings: AutoKontrolleSettings = { aktiv: true, perDayMin: 4, perDayMax: 4, ruheVon: "22:00", ruheBis: "06:00", fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "" };
  const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).format(d);

  // An den Umstellungstagen darf ein nachgezogener Slot nicht auf einer anderen Achse landen als die
  // behaltenen: sonst überlappen sie in Echtzeit, obwohl ihre Plan-Minuten es nicht tun.
  it.each([
    ["Normaltag", "2026-06-15T12:00:00Z"],
    ["Frühjahrs-Umstellungstag", "2026-03-29T12:00:00Z"],
    ["Herbst-Umstellungstag", "2026-10-25T12:00:00Z"],
  ])("hält behaltene und nachgezogene Slots am %s überlappungsfrei", (_label, day) => {
    const now = midnightInTZ(new Date(day), tz);
    const existing: PlannedAutoKontrolle[] = generateAutoKontrollen(settings, now, () => 0, tz)
      .map((s, i) => ({ ...s, id: `k${i}`, sent: false }));
    const { deleteIds, create } = repairAutoKontrollen({ ...settings, perDayMin: 8, perDayMax: 8 }, existing, now, () => 0.5, tz);
    expect(deleteIds).toEqual([]);
    expect(create.length).toBeGreaterThan(0);

    const all = [...existing, ...create].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    for (let i = 1; i < all.length; i++) {
      expect(all[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(all[i - 1].deadline.getTime());
    }
    // Frist nie im Schlaf-Fenster (22:00–06:00 Ortszeit), auch nicht für die nachgezogenen.
    for (const s of create) {
      expect(hhmm(s.wirksamAb) >= "06:00" && hhmm(s.wirksamAb) < "22:00").toBe(true);
      expect(hhmm(s.deadline) > "06:00" && hhmm(s.deadline) <= "22:00").toBe(true);
    }
  });

  // Regression: ein Wach-Fenster (00:30–23:00), das die DST-Wende SELBST enthält. Nachgezogene Slots
  // MÜSSEN auf derselben `awakeStart`-Achse materialisiert werden wie die behaltenen. Würden sie über
  // `dateAtLocalMinutes(now, minute)` aufgelöst, lägen die Slots hinter der Wende eine Stunde zu früh
  // (hier 08:15 / 15:45 statt 09:15 / 16:45) — auf einer anderen Achse als die Slots, die sie ergänzen.
  it("materialisiert nachgezogene Slots auf der Achse von generateAutoKontrollen (DST-Wende im Wach-Fenster)", () => {
    const dstSettings: AutoKontrolleSettings = { ...settings, ruheVon: "23:00", ruheBis: "00:30", perDayMin: 3, perDayMax: 3 };
    const now = midnightInTZ(new Date("2026-03-29T12:00:00Z"), tz);
    const existing: PlannedAutoKontrolle[] = generateAutoKontrollen(dstSettings, now, () => 0, tz)
      .map((s, i) => ({ ...s, id: `k${i}`, sent: true })); // sent ⇒ unantastbar, müssen umgangen werden
    expect(existing.map((e) => hhmm(e.wirksamAb))).toEqual(["00:30", "09:00", "16:30"]);

    const { deleteIds, create } = repairAutoKontrollen({ ...dstSettings, perDayMin: 6, perDayMax: 6 }, existing, now, () => 0, tz);
    expect(deleteIds).toEqual([]);
    expect(create.map((c) => hhmm(c.wirksamAb))).toEqual(["00:45", "09:15", "16:45"]);

    const all = [...existing, ...create].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    for (let i = 1; i < all.length; i++) {
      expect(all[i].wirksamAb.getTime()).toBeGreaterThanOrEqual(all[i - 1].deadline.getTime());
    }
  });

  it("erkennt einen von generateAutoKontrollen erzeugten Plan als gültig (Round-Trip der Achse)", () => {
    for (const day of ["2026-06-15T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z"]) {
      const now = midnightInTZ(new Date(day), tz);
      const existing: PlannedAutoKontrolle[] = generateAutoKontrollen(settings, now, () => 0.5, tz)
        .map((s, i) => ({ ...s, id: `k${i}`, sent: false }));
      expect(repairAutoKontrollen(settings, existing, now, () => 0.5, tz)).toEqual({ deleteIds: [], create: [] });
    }
  });
});
