import { describe, it, expect } from "vitest";
import { buildWearSessions, wearHourPairsByCategory, wearSessionPairsByCategory } from "./sessionModel";
import { buildWearSessionRows } from "./wearSessionRows";
import { wearingHoursFromPairs } from "./utils";

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

/** Die Sessions zu den Einträgen — die abgeleiteten Sichten (Zeilen, Stunden) setzen darauf auf. */
const sessionsOf = (list: ReturnType<typeof e>[]) => buildWearSessions(desc(list), NOW);

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
    const rows = buildWearSessionRows(CATEGORIES, sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T13:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T14:00:00+02:00", PLUG),
    ]), "de");

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.durationStr)).toEqual(["2h", "4h"]);  // Plug2 11–13, Plug 10–14
    expect(rows.map((r) => r.categoryName)).toEqual(["Plug", "Plug"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);           // je Session eine stabile id
  });

  it("laufende Sessions erscheinen nicht — die zeigt ActiveWearSessions", () => {
    const rows = buildWearSessionRows(CATEGORIES, sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T16:00:00+02:00", COLLAR),
    ]), "de");

    expect(rows.map((r) => r.categoryName)).toEqual(["Plug"]);
  });

  it("Sessions einer nicht getrackten Kategorie fallen raus", () => {
    const rows = buildWearSessionRows([CATEGORIES[1]], sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
    ]), "de");

    expect(rows).toEqual([]);
  });

  it("neueste Zeile zuerst, über Kategorien hinweg", () => {
    const rows = buildWearSessionRows(CATEGORIES, sessionsOf([
      e("WEAR_BEGIN", "2026-07-10T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-10T11:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", COLLAR),
      e("WEAR_END", "2026-07-14T11:00:00+02:00", COLLAR),
    ]), "de");

    expect(rows.map((r) => r.categoryName)).toEqual(["Halsband", "Plug"]);
  });
});

// ─── Trage-STUNDEN je Kategorie ────────────────────────────────────────────

const DAY_START = new Date("2026-07-14T00:00:00+02:00");
const DAY_END = new Date("2026-07-15T00:00:00+02:00");
const hoursOf = (pairs: { start: Date; end: Date }[]) => wearingHoursFromPairs(pairs, DAY_START, DAY_END);

describe("wearHourPairsByCategory", () => {
  it("zwei Plugs gleichzeitig zählen ihre gemeinsame Zeit EINMAL (Wanduhr-Zeit)", () => {
    // Der Bug bis v4.50.40: `buildWearPairs` mit categoryId hatte nur EINEN pending-Slot. Beim
    // zweiten WEAR_BEGIN schloss es das erste Paar bei `now` (statt beim Beginn) und verwarf das
    // spätere WEAR_END — aus 4 h Wanduhr wurden 12 h, und das Phantom-Paar wuchs mit `now` weiter.
    const pairs = wearHourPairsByCategory(sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T13:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T14:00:00+02:00", PLUG),
    ]), NOW).get("cat-plug")!;

    // Plug 10–14 umschliesst Plug2 11–13 → eine Spanne 10–14.
    expect(pairs).toHaveLength(1);
    expect(hoursOf(pairs)).toBe(4);
  });

  it("teilweise Überlappung wird zu einer durchgehenden Spanne", () => {
    const pairs = wearHourPairsByCategory(sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T13:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T12:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T15:00:00+02:00", PLUG2),
    ]), NOW).get("cat-plug")!;

    expect(pairs).toHaveLength(1);
    expect(hoursOf(pairs)).toBe(5);   // 10–15, nicht 3 h + 3 h
  });

  it("nacheinander getragene Plugs addieren sich normal", () => {
    const pairs = wearHourPairsByCategory(sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T14:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T15:00:00+02:00", PLUG2),
    ]), NOW).get("cat-plug")!;

    expect(pairs).toHaveLength(2);
    expect(hoursOf(pairs)).toBe(3);
  });

  it("eine laufende Session zählt bis jetzt, ohne über `now` hinauszuwachsen", () => {
    const pairs = wearHourPairsByCategory(sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T16:00:00+02:00", PLUG),
    ]), NOW).get("cat-plug")!;

    expect(hoursOf(pairs)).toBe(2);   // 16:00 → NOW (18:00)
  });

  it("Kategorien bleiben getrennt", () => {
    const byCategory = wearHourPairsByCategory(sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", COLLAR),
      e("WEAR_END", "2026-07-14T15:00:00+02:00", COLLAR),
    ]), NOW);

    expect(hoursOf(byCategory.get("cat-plug")!)).toBe(2);
    expect(hoursOf(byCategory.get("cat-collar")!)).toBe(5);
  });

  it("Kategorie ohne Trage-Einträge fehlt in der Map", () => {
    expect(wearHourPairsByCategory([], NOW).get("cat-plug")).toBeUndefined();
  });
});

describe("wearSessionPairsByCategory", () => {
  it("hält gleichzeitige Sessions getrennt — Grundlage der Session-Rekorde", () => {
    // Die Stunden werden verschmolzen, die SESSIONS nicht: zwei gleichzeitig getragene Plugs sind
    // zwei Sessions (Anzahl, längste, Ø rechnen hierauf), aber nur eine Wanduhr-Spanne.
    const pairs = wearSessionPairsByCategory(sessionsOf([
      e("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG),
      e("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T13:00:00+02:00", PLUG2),
      e("WEAR_END", "2026-07-14T14:00:00+02:00", PLUG),
    ]), NOW).get("cat-plug")!;

    expect(pairs).toHaveLength(2);
    expect(hoursOf(pairs)).toBe(6);   // 4 h + 2 h Gerätestunden — bewusst NICHT die Wanduhr-Zeit
  });
});
