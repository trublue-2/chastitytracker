import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Grenzen des Tagebuchs an der Datenbank: was die Keyholderin LÄDT, und dass Schreiben nur den
 * eigenen Eintrag trifft. Die reinen Regeln (Prüfung, Projektion, Dauern) stehen in `journal.test.ts`.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { prisma } from "@/lib/prisma";
import {
  createJournalEntry,
  deleteJournalEntry,
  listKeyholderJournal,
  journalDaysInRange,
  journalFirstYear,
  journalMoodSeries,
  listOwnJournal,
  loadJournalView,
  searchOwnJournal,
  setJournalSettings,
  updateJournalEntry,
} from "./journalService";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const NOW = new Date("2026-10-16T20:00:00Z");
const AT = new Date("2026-10-16T19:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.journalSettings.findUnique.mockResolvedValue(null);
  db.journalSettings.upsert.mockImplementation(async ({ create }: { create: object }) => ({ defaultVisibility: "FULL", promptsEnabled: true, ...create }));
  db.user.findUniqueOrThrow.mockResolvedValue({ cleaningAllowed: false, cleaningMaxMinutes: 15, cleaningMaxPerDay: 0, cleaningWindows: null });
  db.journalEntry.create.mockResolvedValue({ id: "j1" });
  db.journalEntry.updateMany.mockResolvedValue({ count: 1 });
  db.journalEntry.deleteMany.mockResolvedValue({ count: 1 });
});

describe("listKeyholderJournal", () => {
  it("lädt private Einträge gar nicht erst", async () => {
    await listKeyholderJournal("sub1", {}, NOW);
    const where = db.journalEntry.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("sub1");
    expect(where.visibility).toEqual({ in: ["MOOD_ONLY", "FULL"] });
  });

  it("gibt bei „nur Stimmung“ weder Text noch Leitfrage heraus — auch wenn die Zeile sie trägt", async () => {
    db.journalEntry.findMany.mockResolvedValue([
      { id: "a", entryAt: AT, text: "geheim", mood: 2, prompt: "Frage", visibility: "MOOD_ONLY" },
      // Kommt eine private Zeile doch einmal herein, fällt sie in der Projektion heraus.
      { id: "b", entryAt: AT, text: "ganz geheim", mood: 1, prompt: null, visibility: "PRIVATE" },
    ]);
    const { entries: rows } = await listKeyholderJournal("sub1", {}, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "a", text: null, prompt: null, mood: 2 });
    expect(JSON.stringify(rows)).not.toContain("geheim");
  });
});

describe("listOwnJournal", () => {
  it("liefert dem Besitzer alle Sichtbarkeiten, im gewählten Zeitraum", async () => {
    const from = new Date("2026-03-01T00:00:00Z");
    const to = new Date("2026-04-01T00:00:00Z");
    await listOwnJournal("sub1", { range: { from, to } }, NOW);
    expect(db.journalEntry.findMany.mock.calls[0][0].where).toEqual({ userId: "sub1", entryAt: { gte: from, lt: to } });
  });

  it("blättert über die id und sortiert bei gleicher Zeit stabil", async () => {
    await listOwnJournal("sub1", { cursor: "j9" }, NOW);
    const args = db.journalEntry.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ entryAt: "desc" }, { id: "desc" }]);
    expect(args).toMatchObject({ cursor: { id: "j9" }, skip: 1, take: 31 });
  });

  it("sagt, ob nach der Seite noch etwas kommt", async () => {
    const row = (i: number) => ({ id: `j${i}`, entryAt: AT, text: "x", mood: null, prompt: null, visibility: "FULL" });
    db.journalEntry.findMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => row(i)));
    const page = await listOwnJournal("sub1", {}, NOW);
    expect(page.entries).toHaveLength(30);
    expect(page.hasMore).toBe(true);
  });

  it("eine leere Seite lädt das Protokoll gar nicht erst", async () => {
    db.journalEntry.findMany.mockResolvedValue([]);
    await listOwnJournal("sub1", {}, NOW);
    expect(db.entry.findMany).not.toHaveBeenCalled();
  });

  it("lädt für die Dauern nur Verschluss-, Öffnungs- und Orgasmus-Einträge", async () => {
    db.journalEntry.findMany.mockResolvedValue([{ id: "a", entryAt: AT, text: "x", mood: null, prompt: null, visibility: "FULL" }]);
    db.entry.findMany.mockResolvedValue([{ id: "o", type: "ORGASMUS", startTime: new Date("2026-10-16T09:00:00Z"), boltConfirmedAt: null, openAwaitsBolt: false }]);
    const { entries: [row] } = await listOwnJournal("sub1", {}, NOW);
    expect(db.entry.findMany.mock.calls[0][0].where).toEqual({ userId: "sub1", type: { in: ["VERSCHLUSS", "OEFFNEN", "ORGASMUS"] } });
    expect(row).toMatchObject({ lockedMs: null, orgasmFreeMs: 10 * 3_600_000 });
  });
});

describe("createJournalEntry", () => {
  it("übernimmt ohne Angabe den Standard des Subs", async () => {
    db.journalSettings.findUnique.mockResolvedValue({ defaultVisibility: "PRIVATE", promptsEnabled: true });
    await createJournalEntry("sub1", { entryAt: AT, text: "Hallo", mood: null }, NOW);
    expect(db.journalEntry.create.mock.calls[0][0].data).toMatchObject({ userId: "sub1", visibility: "PRIVATE" });
  });

  it("eine ausdrückliche Wahl geht dem Standard vor", async () => {
    await createJournalEntry("sub1", { entryAt: AT, text: "Hallo", mood: 3, visibility: "MOOD_ONLY" }, NOW);
    expect(db.journalEntry.create.mock.calls[0][0].data.visibility).toBe("MOOD_ONLY");
  });

  it("lehnt eine unbekannte Sichtbarkeit ab, statt sie zu speichern", async () => {
    const r = await createJournalEntry("sub1", { entryAt: AT, text: "Hallo", mood: 3, visibility: "PUBLIC" }, NOW);
    expect(r).toEqual({ ok: false, status: 400, error: "JOURNAL_INVALID_VISIBILITY" });
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it("speichert keine Leitfrage, wenn der Sub sie abgeschaltet hat", async () => {
    db.journalSettings.findUnique.mockResolvedValue({ defaultVisibility: "FULL", promptsEnabled: false });
    await createJournalEntry("sub1", { entryAt: AT, text: "Hallo", mood: null, prompt: "Was war schwierig?" }, NOW);
    expect(db.journalEntry.create.mock.calls[0][0].data.prompt).toBeNull();
  });

  it("schreibt nichts bei leerem Text", async () => {
    const r = await createJournalEntry("sub1", { entryAt: AT, text: "  ", mood: null }, NOW);
    expect(r).toMatchObject({ ok: false, error: "JOURNAL_TEXT_REQUIRED" });
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe("createJournalEntry ohne Einstellungs-Zeile", () => {
  it("teilt standardmässig mit der Keyholderin und zeigt Leitfragen", async () => {
    await createJournalEntry("sub1", { entryAt: AT, text: "Hallo", mood: null, prompt: "Was war schwierig?" }, NOW);
    expect(db.journalEntry.create.mock.calls[0][0].data).toMatchObject({ visibility: "FULL", prompt: "Was war schwierig?" });
  });
});

describe("setJournalSettings", () => {
  it("legt die Zeile beim ersten Umstellen an und schreibt nur übergebene Felder", async () => {
    const r = await setJournalSettings("sub1", { defaultVisibility: "PRIVATE" });
    expect(r).toMatchObject({ ok: true, data: { defaultVisibility: "PRIVATE" } });
    const call = db.journalSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "sub1" });
    expect(call.update).toEqual({ defaultVisibility: "PRIVATE" });
  });

  it("lehnt Unbekanntes und leere Änderungen ab", async () => {
    expect(await setJournalSettings("sub1", { defaultVisibility: "PUBLIC" })).toMatchObject({ error: "JOURNAL_INVALID_VISIBILITY" });
    expect(await setJournalSettings("sub1", { promptsEnabled: "ja" })).toMatchObject({ error: "JOURNAL_INVALID_SETTING" });
    expect(await setJournalSettings("sub1", {})).toMatchObject({ error: "JOURNAL_INVALID_SETTING" });
    expect(db.journalSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("updateJournalEntry", () => {
  it("findet und schreibt nur über den Besitzer — eine fremde id ist 404", async () => {
    db.journalEntry.findFirst.mockResolvedValue(null);
    const r = await updateJournalEntry("keyholder", "j1", { visibility: "PRIVATE" }, NOW);
    expect(r).toEqual({ ok: false, status: 404, error: "NOT_FOUND" });
    expect(db.journalEntry.findFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "keyholder" });
    expect(db.journalEntry.updateMany).not.toHaveBeenCalled();
  });

  it("ändert nur die Sichtbarkeit, wenn nur sie kommt — die Leitfrage wird nie geschrieben", async () => {
    db.journalEntry.findFirst.mockResolvedValue({ entryAt: AT, text: "Hallo", mood: 3 });
    await updateJournalEntry("sub1", "j1", { visibility: "PRIVATE" }, NOW);
    const call = db.journalEntry.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "j1", userId: "sub1" });
    expect(call.data).toEqual({ entryAt: AT, text: "Hallo", mood: 3, visibility: "PRIVATE" });
    expect(call.data).not.toHaveProperty("prompt");
  });

  it("prüft auch beim Bearbeiten: kein Zeitpunkt in der Zukunft", async () => {
    db.journalEntry.findFirst.mockResolvedValue({ entryAt: AT, text: "Hallo", mood: 3 });
    const r = await updateJournalEntry("sub1", "j1", { entryAt: new Date("2027-01-01T00:00:00Z") }, NOW);
    expect(r).toMatchObject({ ok: false, error: "TIME_IN_FUTURE" });
  });
});

describe("deleteJournalEntry", () => {
  it("löscht nur den eigenen Eintrag", async () => {
    db.journalEntry.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteJournalEntry("keyholder", "j1")).toEqual({ ok: false, status: 404, error: "NOT_FOUND" });
    expect(db.journalEntry.deleteMany.mock.calls[0][0].where).toEqual({ id: "j1", userId: "keyholder" });
  });
});

describe("Kalender, Jahre und Stimmungskurve der Keyholderin", () => {
  it("zählen nur Freigegebenes — kein Kalenderpunkt, kein Jahr und kein Stimmungswert aus Privatem", async () => {
    await journalDaysInRange("sub1", { from: AT, to: NOW }, "UTC", "keyholder");
    await journalFirstYear("sub1", "UTC", "keyholder");
    await journalMoodSeries("sub1", "keyholder", NOW);
    for (const call of [db.journalEntry.findMany.mock.calls[0], db.journalEntry.findFirst.mock.calls[0], db.journalEntry.findMany.mock.calls[1]]) {
      expect(call[0].where.visibility).toEqual({ in: ["MOOD_ONLY", "FULL"] });
    }
  });

  it("der Besitzer sieht seine Kalendertage ohne Filter, in seiner Zeitzone", async () => {
    db.journalEntry.findMany.mockResolvedValue([
      { entryAt: new Date("2026-03-12T23:30:00Z") },
      { entryAt: new Date("2026-03-12T08:00:00Z") },
    ]);
    // 23:30 UTC ist in Zürich schon der 13.
    expect(await journalDaysInRange("sub1", {}, "Europe/Zurich", "own")).toEqual([12, 13]);
    expect(db.journalEntry.findMany.mock.calls[0][0].where).not.toHaveProperty("visibility");
  });

  it("die Stimmungskurve markiert Privates in der eigenen Sicht", async () => {
    db.journalEntry.findMany.mockResolvedValue([{ entryAt: AT, mood: 2, visibility: "PRIVATE" }]);
    expect(await journalMoodSeries("sub1", "own", NOW)).toEqual([{ at: AT, mood: 2, private: true }]);
  });
});

describe("searchOwnJournal", () => {
  it("sucht nur in den eigenen Einträgen", async () => {
    db.journalEntry.findMany.mockResolvedValue([]);
    await searchOwnJournal("sub1", "  müde ", NOW);
    expect(db.journalEntry.findMany.mock.calls[0][0].where).toEqual({ userId: "sub1" });
  });

  it("% und _ sind wörtlich gemeint, Gross/Klein egal — auch bei Umlauten", async () => {
    const row = (id: string, text: string) => ({ id, entryAt: AT, text, mood: null, prompt: null, visibility: "PRIVATE" });
    db.journalEntry.findMany.mockResolvedValue([row("a", "axb 50 Punkte"), row("b", "Heute MÜDE"), row("c", "a_b und 50%")]);
    expect((await searchOwnJournal("sub1", "a_b", NOW)).entries.map((e) => e.id)).toEqual(["c"]);
    expect((await searchOwnJournal("sub1", "50%", NOW)).entries.map((e) => e.id)).toEqual(["c"]);
    expect((await searchOwnJournal("sub1", "müde", NOW)).entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("eine leere Suche fragt die Datenbank gar nicht erst", async () => {
    expect(await searchOwnJournal("sub1", "   ", NOW)).toEqual({ entries: [], hasMore: false });
    expect(db.journalEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("loadJournalView", () => {
  it("die Keyholder-Sicht sucht nie — ein ?q= liefert ihre gewöhnliche, gefilterte Liste", async () => {
    const view = await loadJournalView("sub1", { q: "geheim" }, "UTC", "keyholder", NOW);
    expect(view.state.query).toBe("");
    const listCall = db.journalEntry.findMany.mock.calls[0][0];
    expect(listCall.where).toMatchObject({ userId: "sub1", visibility: { in: ["MOOD_ONLY", "FULL"] } });
    expect(listCall.where).not.toHaveProperty("OR");
  });

  it("die eigene Sicht nimmt Monat und Jahr aus der Monatswahl", async () => {
    const view = await loadJournalView("sub1", { m: "03", y: "2026", view: "calendar" }, "UTC", "own", NOW);
    expect(view.state).toMatchObject({ month: { year: 2026, month0: 2 }, calendar: true, query: "" });
  });
});
