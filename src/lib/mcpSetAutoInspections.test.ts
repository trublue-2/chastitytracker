import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `set_auto_inspections` — die Schreib-Seite der AUTOMATISCHEN Kontrollen über den MCP.
 * Gepinnt wird hier, was das Tool ÜBER dem Service leistet: der volle Ergebnis-Stand (Patch auf
 * Bestand), die Ausrichtung der Von-/Bis-Paare in Richtung der geäusserten Absicht, und die
 * Ablehnung der Fenster-Kombinationen, die der Planer sonst kommentarlos übergeht.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() } },
}));
vi.mock("@/lib/autoKontrolleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/autoKontrolleService")>();
  return { ...actual, setAutoKontrolleSettings: vi.fn().mockResolvedValue({ ok: true, data: null }) };
});

import { mcpSetAutoInspections } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { setAutoKontrolleSettings } from "@/lib/autoKontrolleService";

const findUniqueOrThrowMock = prisma.user.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const setSettingsMock = setAutoKontrolleSettings as unknown as ReturnType<typeof vi.fn>;

/** Bestand: aktiv, 2–4 Kontrollen/Tag, Schlaf 22–06, Frist 15–60, kein festes Auslöse-Fenster. */
const BESTAND = {
  id: "u1", timezone: "Europe/Zurich", autoKontrolleAktiv: true,
  autoKontrollePerDayMin: 2, autoKontrollePerDayMax: 4,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
  autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
  autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
  autoKontrolleNurBeiSperre: false, autoInspectionPlannedFor: null,
  autoKontrolleDays: 0b111_1111, autoKontrolleDayRules: null as string | null,
};

/** Der Stand, den der Service zu schreiben bekommt. */
const gespeichert = () => setSettingsMock.mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1" });
  findUniqueOrThrowMock.mockResolvedValue(BESTAND);
  setSettingsMock.mockResolvedValue({ ok: true, data: null });
});

describe("set_auto_inspections — Patch auf den Bestand", () => {
  it("verlangt mindestens ein Feld", async () => {
    await expect(mcpSetAutoInspections("sub", {})).rejects.toThrow(/at least one of/);
    expect(setSettingsMock).not.toHaveBeenCalled();
  });

  it("schreibt den VOLLEN Ergebnis-Stand: das eine gepatchte Feld, der Rest unverändert", async () => {
    await mcpSetAutoInspections("sub", { onlyDuringLockPeriod: true });
    expect(gespeichert()).toEqual({
      aktiv: true, perDayMin: 2, perDayMax: 4, ruheVon: "22:00", ruheBis: "06:00",
      fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "", nurBeiSperre: true,
      // `dayRules` bleibt undefined, wenn der Aufruf keine setzt — der Dienst lässt die Spalte dann
      // in Ruhe. Der Bestand steckt schon in `after`, ein Zurückschreiben wäre nur Rauschen.
      days: 0b111_1111, dayRules: undefined,
    });
  });

  // Das Tool-Schema (route.ts) weist Werte ausserhalb der Bereiche inzwischen schon ab. Der Klemm-
  // Schritt hier bleibt die zweite Linie — für jeden Aufrufer, der nicht durch die zod-Validierung kam.
  it("klemmt Zahlen auf die erlaubten Bereiche (12/Tag, 240 Min Frist)", async () => {
    await mcpSetAutoInspections("sub", { perDayMax: 99, deadlineMinTo: 9999 });
    expect(gespeichert()).toMatchObject({ perDayMax: 12, fristBis: 240 });
  });

  it("schaltet ab, ohne die übrigen Werte anzufassen — und sagt es in der Meldung", async () => {
    const r = await mcpSetAutoInspections("sub", { active: false }) as { message: string };
    expect(gespeichert()).toMatchObject({ aktiv: false, perDayMin: 2, perDayMax: 4 });
    expect(r.message).toMatch(/OFF/);
  });

  it("nennt perDayMax:0 beim Namen, statt Erfolg zu melden und nichts zu planen", async () => {
    const r = await mcpSetAutoInspections("sub", { perDayMax: 0 }) as { message: string };
    expect(r.message).toMatch(/no daily inspections/);
  });
});

/** Ein halber Patch darf kein Paar hinterlassen, dessen eine Hälfte die Planung still übergeht
 *  (`perDayRange`/`fristRange` heben „bis" ohnehin auf „von" an). */
describe("set_auto_inspections — Von-/Bis-Paare folgen der geäusserten Absicht", () => {
  it("hoechstens 2/Tag zieht die Untergrenze mit (Bestand 2–4 → 2–2 statt 4–2)", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ ...BESTAND, autoKontrollePerDayMin: 4 });
    await mcpSetAutoInspections("sub", { perDayMax: 2 });
    expect(gespeichert()).toMatchObject({ perDayMin: 2, perDayMax: 2 });
  });

  it("mindestens 6/Tag hebt die Obergrenze mit (Bestand 2–4 → 6–6)", async () => {
    await mcpSetAutoInspections("sub", { perDayMin: 6 });
    expect(gespeichert()).toMatchObject({ perDayMin: 6, perDayMax: 6 });
  });

  it("beide gesetzt und verdreht: bis steigt auf von — wie im Service", async () => {
    await mcpSetAutoInspections("sub", { perDayMin: 5, perDayMax: 3 });
    expect(gespeichert()).toMatchObject({ perDayMin: 5, perDayMax: 5 });
  });

  it("dieselbe Regel für die Frist-Spanne", async () => {
    await mcpSetAutoInspections("sub", { deadlineMinTo: 10 });
    expect(gespeichert()).toMatchObject({ fristVon: 10, fristBis: 10 });
  });
});

describe("set_auto_inspections — Zeiten und festes Auslöse-Fenster", () => {
  it("lehnt eine kaputte Uhrzeit ab, ohne zu schreiben", async () => {
    await expect(mcpSetAutoInspections("sub", { sleepFrom: "25:99" })).rejects.toThrow(/Invalid time/);
    expect(setSettingsMock).not.toHaveBeenCalled();
  });

  it("lehnt ein halbes Fenster ab (der Planer ignoriert es sonst kommentarlos)", async () => {
    await expect(mcpSetAutoInspections("sub", { triggerWindowFrom: "10:00" })).rejects.toThrow(/needs both/);
    expect(setSettingsMock).not.toHaveBeenCalled();
  });

  it("lehnt ein rückwärts laufendes Fenster ab", async () => {
    await expect(mcpSetAutoInspections("sub", { triggerWindowFrom: "16:00", triggerWindowUntil: "10:00" }))
      .rejects.toThrow(/must be before/);
  });

  it("lehnt ein Fenster ab, das ganz im Schlaf-Fenster liegt — es käme nie eine Kontrolle", async () => {
    await expect(mcpSetAutoInspections("sub", { triggerWindowFrom: "23:00", triggerWindowUntil: "23:30" }))
      .rejects.toThrow(/entirely inside the sleep window/);
  });

  it("prüft das Fenster am ERGEBNIS: ein neues Schlaf-Fenster kann ein bestehendes verschlucken", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ ...BESTAND, autoKontrolleFensterVon: "10:00", autoKontrolleFensterBis: "16:00" });
    await expect(mcpSetAutoInspections("sub", { sleepFrom: "09:00", sleepUntil: "17:00" }))
      .rejects.toThrow(/entirely inside the sleep window/);
  });

  it("setzt ein Fenster und ergänzt es später an EINEM Ende", async () => {
    await mcpSetAutoInspections("sub", { triggerWindowFrom: "10:00", triggerWindowUntil: "16:00" });
    expect(gespeichert()).toMatchObject({ fensterVon: "10:00", fensterBis: "16:00" });

    setSettingsMock.mockClear();
    findUniqueOrThrowMock.mockResolvedValue({ ...BESTAND, autoKontrolleFensterVon: "10:00", autoKontrolleFensterBis: "16:00" });
    await mcpSetAutoInspections("sub", { triggerWindowUntil: "18:00" });
    expect(gespeichert()).toMatchObject({ fensterVon: "10:00", fensterBis: "18:00" });
  });

  it("null an BEIDEN Enden schaltet das Fenster ab", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ ...BESTAND, autoKontrolleFensterVon: "10:00", autoKontrolleFensterBis: "16:00" });
    await mcpSetAutoInspections("sub", { triggerWindowFrom: null, triggerWindowUntil: null });
    expect(gespeichert()).toMatchObject({ fensterVon: "", fensterBis: "" });
  });
});

describe("set_auto_inspections — dryRun", () => {
  it("committet nichts und zeigt den Diff in den Feldnamen der Lese-Sicht", async () => {
    const r = await mcpSetAutoInspections("sub", { dryRun: true, perDayMin: 3, triggerWindowFrom: "10:00", triggerWindowUntil: "16:00" }) as {
      dryRun: boolean; wouldSucceed: boolean;
      preview: { perDayMin: number; triggerWindowFrom: string | null };
      diff: Record<string, [unknown, unknown]>;
    };
    expect(r.dryRun).toBe(true);
    expect(r.wouldSucceed).toBe(true);
    expect(setSettingsMock).not.toHaveBeenCalled();
    expect(r.preview.perDayMin).toBe(3);
    expect(r.diff.perDayMin).toEqual([2, 3]);
    expect(r.diff.triggerWindowFrom).toEqual([null, "10:00"]);
    expect(r.diff.sleepFrom).toBeUndefined(); // unverändert → nicht im Diff
  });

  it("zeigt im Preview den GEKLEMMTEN Wert, nicht den rohen Input", async () => {
    const r = await mcpSetAutoInspections("sub", { dryRun: true, perDayMax: 99 }) as { preview: { perDayMax: number } };
    expect(r.preview.perDayMax).toBe(12);
  });

  it("lehnt eine ungültige Kombination schon im Preview ab, statt Erfolg zu versprechen", async () => {
    await expect(mcpSetAutoInspections("sub", { dryRun: true, triggerWindowFrom: "23:00", triggerWindowUntil: "23:30" }))
      .rejects.toThrow(/entirely inside the sleep window/);
  });
});


/**
 * Die Wochentage über den MCP: ISO-Listen nach aussen, Bitmaske und JSON-String nach innen. Die
 * Übersetzung steht in `toDayRule`/`weekdayMaskOf` — hier wird geprüft, dass sie stattfindet und
 * dass der Agent die Ablehnungen mit STELLE bekommt statt eines nackten „Invalid time".
 */
describe("set_auto_inspections — Wochentage", () => {
  it("planDays kommt als ISO-Liste und geht als Maske weiter", async () => {
    const r = await mcpSetAutoInspections("sub", { planDays: [1, 2, 3, 4, 5] }) as { message: string };
    expect(gespeichert().days).toBe(0b11111);
    expect(r.message).toContain("Planned on mon,tue,wed,thu,fri only.");
  });

  it("alle sieben Tage stehen NICHT in der Meldung — das ist der Normalfall, kein Ergebnis", async () => {
    const r = await mcpSetAutoInspections("sub", { planDays: [1, 2, 3, 4, 5, 6, 7] }) as { message: string };
    expect(r.message).not.toContain("Planned on");
  });

  it("dayRules gehen als LISTE an den Dienst, nicht als JSON-String", async () => {
    // Die Speicher-Form (String) trägt Diff und `planningChanged`; der Dienst nimmt die Liste und
    // prüft sie selbst. Bekäme er den String, lehnte er mit `invalidTime` ab — und zwar jeden
    // Aufruf, der Ausnahmen setzt. Der Mock des Dienstes verdeckt das, deshalb steht es hier.
    const r = await mcpSetAutoInspections("sub", {
      dayRules: [{ days: [2], sleepFrom: "19:00", sleepUntil: "06:00" }],
    }) as { message: string };
    expect(gespeichert().dayRules).toEqual([
      { days: 0b10, ruheVon: "19:00", ruheBis: "06:00", fensterVon: "", fensterBis: "" },
    ]);
    expect(r.message).toContain("Day exceptions: tue quiet 19:00-06:00.");
  });

  it("dayRules:[] löscht die Ausnahmen — dann gilt überall der Grundstand", async () => {
    const r = await mcpSetAutoInspections("sub", { dayRules: [] }) as { message: string };
    expect(gespeichert().dayRules).toEqual([]);
    expect(r.message).not.toContain("Day exceptions");
  });

  it("ohne dayRules bleibt die Spalte unberührt (undefined, nicht der Bestands-String)", async () => {
    await mcpSetAutoInspections("sub", { perDayMin: 3 });
    expect(gespeichert().dayRules).toBeUndefined();
  });

  it("eine Ausnahme, deren Auslöse-Fenster ganz im Schlaf liegt, wird mit STELLE abgelehnt", async () => {
    await expect(mcpSetAutoInspections("sub", {
      dayRules: [
        { days: [1], sleepFrom: "22:00", sleepUntil: "06:00" },
        { days: [2], sleepFrom: "22:00", sleepUntil: "06:00", triggerWindowFrom: "23:00", triggerWindowUntil: "23:30" },
      ],
    })).rejects.toThrow(/dayRules\[1\].*entirely inside the sleep window/);
    expect(setSettingsMock).not.toHaveBeenCalled();
  });

  it("dieselbe Ablehnung schon im dryRun", async () => {
    await expect(mcpSetAutoInspections("sub", {
      dryRun: true, dayRules: [{ days: [2], sleepFrom: "99:00", sleepUntil: "06:00" }],
    })).rejects.toThrow(/dayRules\[0\]/);
  });

  it("der dryRun zeigt die alten gegen die neuen Ausnahmen", async () => {
    const r = await mcpSetAutoInspections("sub", {
      dryRun: true, dayRules: [{ days: [2], sleepFrom: "19:00", sleepUntil: "06:00" }],
    }) as { preview: { dayRules: string[] }; diff: Record<string, [unknown, unknown]> };
    expect(r.preview.dayRules).toEqual(["tue quiet 19:00-06:00"]);
    expect(r.diff.dayRules).toEqual([[], ["tue quiet 19:00-06:00"]]);
    expect(setSettingsMock).not.toHaveBeenCalled();
  });
});
