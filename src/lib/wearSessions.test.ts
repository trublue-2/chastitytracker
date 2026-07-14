import { describe, it, expect } from "vitest";
import { buildWearSessions } from "./sessionModel";
import { buildWearSessionRows } from "./wearSessionRows";

/**
 * Die Trage-Sessions der Nicht-KG-Kategorien. Bis v4.50.37 gab es sie nirgends: `buildSessions`
 * kennt nur VERSCHLUSS/OEFFNEN, und `list_sessions` — das einzige Tool, das je Plug-Sessions
 * auflistete — fiel mit der V1-Schicht weg. `get_session` war damit KG-blind.
 */

const NOW = new Date("2026-07-14T18:00:00+02:00");
const PLUG = { id: "d-plug", name: "njoy pure plug large", categoryId: "cat-plug" };
const PLUG2 = { id: "d-plug2", name: "Zweiter Plug", categoryId: "cat-plug" };
const COLLAR = { id: "d-collar", name: "Ali-Collar", categoryId: "cat-collar" };

let seq = 0;
const e = (type: string, time: string, device: object | null) => ({
  id: `e${++seq}`, type, startTime: new Date(time), device,
});

/** Entries kommen aus der DB absteigend (jüngste zuerst) — genau so füttern wir sie. */
const desc = (list: ReturnType<typeof e>[]) =>
  [...list].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

const H = 3_600_000;

describe("buildWearSessions", () => {
  it("ein abgeschlossener Zyklus wird eine Session mit genau einem Segment", () => {
    const [s] = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-14T14:39:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T15:56:00+02:00", PLUG),
    ]), NOW);

    expect(s.segments).toHaveLength(1);
    expect(s.isOpen).toBe(false);
    expect(s.endReason).toBe("closed");
    expect(s.cleaningPauses).toBe(0);          // WEAR kennt keine Reinigungspausen
    expect(s.categoryId).toBe("cat-plug");
    expect(s.durationMs).toBe(77 * 60_000);    // 14:39 → 15:56
    expect(s.deviceBreakdown[0].deviceName).toBe("njoy pure plug large");
  });

  it("das Gerät gilt wie deklariert — eine Kontrolle belegt den Gürtel, nicht den Plug", () => {
    const [s] = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("PRUEFUNG", "2026-07-14T11:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
    ]), NOW);

    expect(s.segments[0].deviceConfidence).toBe("declared");
    expect(s.segments[0].controls).toEqual([]);   // PRUEFUNG wird NICHT verknüpft
  });

  it("eine laufende Session bleibt offen und zählt bis jetzt", () => {
    const [s] = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-14T16:00:00+02:00", PLUG),
    ]), NOW);

    expect(s.isOpen).toBe(true);
    expect(s.end).toBeNull();
    expect(s.durationMs).toBe(2 * H);          // 16:00 → NOW
  });

  it("zwei Geräte DERSELBEN Kategorie gleichzeitig — zwei getrennte Sessions", () => {
    // Würde je Kategorie gepaart, schlösse das WEAR_END des einen Plugs auf den WEAR_BEGIN des
    // anderen: beide Dauern wären frei erfunden. Der Live-Zustand zählt ebenfalls pro Gerät.
    const sessions = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
    ]), NOW);

    const first = sessions.find((s) => s.deviceBreakdown[0].deviceId === "d-plug")!;
    const second = sessions.find((s) => s.deviceBreakdown[0].deviceId === "d-plug2")!;
    expect(first.durationMs).toBe(2 * H);   // 10–12, abgeschlossen
    expect(first.isOpen).toBe(false);
    expect(second.durationMs).toBe(7 * H);  // 11 → NOW, noch offen
    expect(second.isOpen).toBe(true);
  });

  it("verschiedene Kategorien laufen unabhängig nebeneinander", () => {
    const sessions = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", COLLAR),
      e("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T14:00:00+02:00", COLLAR),
    ]), NOW);

    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.categoryId === "cat-collar")!.durationMs).toBe(4 * H);
    expect(sessions.find((s) => s.categoryId === "cat-plug")!.durationMs).toBe(1 * H);
  });

  it("KG-Einträge bleiben aussen vor — dafür ist buildSessions da", () => {
    expect(buildWearSessions(desc([
      e("VERSCHLUSS", "2026-07-10T10:00:00+02:00", { id: "d-kg", name: "Flatty", categoryId: "cat-kg" }),
      e("OEFFNEN", "2026-07-11T10:00:00+02:00", null),
    ]), NOW)).toEqual([]);
  });

  it("ein doppelter WEAR_BEGIN erfindet keine Session", () => {
    // Daten-Anomalie: zwei Beginne ohne Ende dazwischen. Der ältere ist weder abgeschlossen noch
    // die laufende Session — ihn bis jetzt hochzurechnen erfände Stunden.
    const sessions = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T16:00:00+02:00", PLUG),
    ]), NOW);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].start).toEqual(new Date("2026-07-14T16:00:00+02:00"));
    expect(sessions[0].durationMs).toBe(2 * H);
  });

  it("neueste Session zuerst", () => {
    const sessions = buildWearSessions(desc([
      e("WEAR_BEGIN", "2026-07-10T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-10T11:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", COLLAR),
      e("WEAR_END", "2026-07-14T11:00:00+02:00", COLLAR),
    ]), NOW);

    expect(sessions.map((s) => s.categoryId)).toEqual(["cat-collar", "cat-plug"]);
  });
});

// ─── buildWearSessionRows (Dashboard-Zeilen) ───────────────────────────────

const CATEGORIES = [
  { id: "cat-plug", name: "Plug", color: "blue", icon: "circle" },
  { id: "cat-collar", name: "Halsband", color: "red", icon: "square" },
];

describe("buildWearSessionRows", () => {
  it("zwei Geräte DERSELBEN Kategorie gleichzeitig — zwei Zeilen mit echten Dauern", () => {
    // Bis v4.50.38 paarte die Dashboard-Liste je KATEGORIE: das WEAR_END von Plug 1 schloss auf den
    // WEAR_BEGIN von Plug 2, beide Dauern waren erfunden. Jetzt paart sie je Gerät wie der
    // Live-Zustand (getActiveWearSessions) und wie buildWearSessions.
    const rows = buildWearSessionRows(CATEGORIES, desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T13:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T14:00:00+02:00", PLUG),
    ]), NOW, "de");

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.durationStr)).toEqual(["2h", "4h"]);  // Plug2 11–13, Plug 10–14
    expect(rows.map((r) => r.categoryName)).toEqual(["Plug", "Plug"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);           // je Session eine stabile id
  });

  it("laufende Sessions erscheinen nicht — die zeigt ActiveWearSessions", () => {
    const rows = buildWearSessionRows(CATEGORIES, desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T16:00:00+02:00", COLLAR),
    ]), NOW, "de");

    expect(rows.map((r) => r.categoryName)).toEqual(["Plug"]);
  });

  it("Sessions einer nicht getrackten Kategorie fallen raus", () => {
    const rows = buildWearSessionRows([CATEGORIES[1]], desc([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
    ]), NOW, "de");

    expect(rows).toEqual([]);
  });

  it("neueste Zeile zuerst, über Kategorien hinweg", () => {
    const rows = buildWearSessionRows(CATEGORIES, desc([
      e("WEAR_BEGIN", "2026-07-10T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-10T11:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", COLLAR),
      e("WEAR_END", "2026-07-14T11:00:00+02:00", COLLAR),
    ]), NOW, "de");

    expect(rows.map((r) => r.categoryName)).toEqual(["Halsband", "Plug"]);
  });
});
