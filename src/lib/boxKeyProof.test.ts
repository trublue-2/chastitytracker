import { describe, it, expect, vi } from "vitest";

/**
 * Der Schlüssel-Nachweis aus der Telemetrie behauptet etwas über den Sub, ohne dass er ein Foto
 * gemacht hat. Ein Fehler hier erklärt eine Kontrolle für nachgewiesen, obwohl der Riegel gelaufen
 * ist — oder er verschweigt eine Beweislücke, weil die Box gar nicht gemeldet hat.
 *
 * Der teuerste Fehler ist dabei nicht das einzelne falsche Fenster, sondern die WIEDERAUFNAHME der
 * Kette: prüft man jede Kontrolle nur gegen ihren direkten Vorgänger, fällt nach einer gemeldeten
 * Öffnung genau eine Kontrolle durch, und die übernächste ist wieder „belegt" — obwohl seither
 * niemand mehr nachgesehen hat. Die Tests unten halten deshalb beides fest: die vier Bedingungen
 * einzeln, und dass eine gerissene Kette gerissen bleibt.
 */

// Nur die reine Ableitung wird geprüft — der Prisma-Client des Moduls bleibt eine Attrappe.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { deriveTelemetryKeyProof, keyProofFor, sessionBoltAnchors, type BoltAnchor } from "./boxKeyProof";

const T = (iso: string) => new Date(iso);

/** Kontroll-Anker: erfasst zur eingetippten Zeit, ohne Foto-Urteil (der Normalfall dieses Features). */
const check = (id: string, at: Date, over: Partial<Extract<BoltAnchor, { kind: "inspection" }>> = {}): BoltAnchor =>
  ({ kind: "inspection", id, at, recordedAt: at, keyDetected: null, ...over });

const LOCK: BoltAnchor = { kind: "lock", id: "lock", at: T("2026-07-20T10:00:00Z"), keyInBox: true };
const CHECK_1 = check("check1", T("2026-07-21T10:00:00Z"));
const CHECK_2 = check("check2", T("2026-07-22T10:00:00Z"));
const SYNCED = T("2026-07-22T11:00:00Z");

const derive = (over: Partial<Parameters<typeof deriveTelemetryKeyProof>[0]> = {}) => [
  ...deriveTelemetryKeyProof({
    anchors: [LOCK, CHECK_1, CHECK_2],
    boltOpenedAt: [],
    lastSyncAt: SYNCED,
    physicallyLocked: true,
    ...over,
  }),
];

describe("deriveTelemetryKeyProof", () => {
  it("belegt jede Kontrolle, vor der sich der Riegel nicht bewegt hat", () => {
    expect(derive()).toEqual(["check1", "check2"]);
  });

  it("belegt einen Verschluss NIE — dort bewegt sich der Riegel gerade", () => {
    expect(derive()).not.toContain("lock");
  });

  // ── Gerissene Kette bleibt gerissen ──
  it("belegt nach einer gemeldeten Öffnung KEINE spätere Kontrolle mehr", () => {
    // Öffnung zwischen Einschluss und erster Kontrolle: seither hat niemand nachgesehen, also ist
    // auch die zweite Kontrolle nicht belegt — sie darf die erste nicht als Kettenglied erben.
    expect(derive({ boltOpenedAt: [T("2026-07-20T20:00:00Z")] })).toEqual([]);
  });

  it("zählt eine Öffnung GENAU auf dem Anker noch zum laufenden Fenster", () => {
    expect(derive({ boltOpenedAt: [CHECK_1.at] })).toEqual([]);
  });

  it("ignoriert Öffnungen vor dem Einschluss (Vor-Session-Historie)", () => {
    expect(derive({ boltOpenedAt: [T("2026-07-19T10:00:00Z")] })).toEqual(["check1", "check2"]);
  });

  it("nimmt die Kette nach einem Foto-Nachweis wieder auf", () => {
    // Der Sub hat nach der Öffnung wieder fotografiert: ab da trägt die Telemetrie erneut.
    const withPhoto = check("check1", CHECK_1.at, { keyDetected: true });
    expect(derive({ anchors: [LOCK, withPhoto, CHECK_2], boltOpenedAt: [T("2026-07-20T20:00:00Z")] })).toEqual(["check2"]);
  });

  it("reisst die Kette an einem Foto-NEIN ab", () => {
    const photoSaysNo = check("check1", CHECK_1.at, { keyDetected: false });
    expect(derive({ anchors: [LOCK, photoSaysNo, CHECK_2] })).toEqual([]);
  });

  // ── Offline / Meldelücke ──
  it("sagt nichts über Zeitpunkte, die JÜNGER sind als der letzte Box-Sync", () => {
    expect(derive({ lastSyncAt: T("2026-07-21T12:00:00Z") })).toEqual(["check1"]);
  });

  it("sagt gar nichts, wenn die Box nie gemeldet hat", () => {
    expect(derive({ lastSyncAt: null })).toEqual([]);
  });

  it("sagt gar nichts, wenn der Sync älter ist als der Einschluss", () => {
    expect(derive({ lastSyncAt: T("2026-07-20T09:00:00Z") })).toEqual([]);
  });

  it("misst die Frische an der ECHTEN Entstehungszeit — Rückdatieren hilft nicht", () => {
    // Eingetippt „vorgestern", tatsächlich erfasst nach dem letzten Sync: die Box hat zu diesem
    // Eintrag nichts mehr gemeldet, also gibt es nichts zu belegen.
    const backdated = check("check1", T("2026-07-20T11:00:00Z"), { recordedAt: T("2026-07-22T20:00:00Z") });
    expect(derive({ anchors: [LOCK, backdated] })).toEqual([]);
  });

  it("schweigt, wenn die Box zuletzt physisch OFFEN gemeldet hat", () => {
    // Offline-Failsafe: die Box hat sich selbst geöffnet und konnte es niemandem melden. Der
    // Ereignis-Strom ist damit als Beweis wertlos.
    expect(derive({ physicallyLocked: false })).toEqual([]);
  });

  // ── Schlüssel-Deklaration ──
  it("schweigt, wenn der Schlüssel laut Sub gar nicht in der Box liegt", () => {
    expect(derive({ anchors: [{ ...LOCK, keyInBox: false }, CHECK_1, CHECK_2] })).toEqual([]);
  });

  it("schweigt bei unbekannter Deklaration (Alt-Eintrag, Admin-Pfad)", () => {
    expect(derive({ anchors: [{ ...LOCK, keyInBox: null }, CHECK_1, CHECK_2] })).toEqual([]);
  });

  it("folgt der Deklaration des JÜNGSTEN Verschlusses, nicht der des Session-Starts", () => {
    // Nach der Reinigungspause schliesst der Sub mit dem Schlüssel in der Tasche wieder zu: ab dort
    // ist die Box leer, der unbewegte Riegel belegt nichts mehr.
    const open: BoltAnchor = { kind: "open", id: "open", at: T("2026-07-21T12:00:00Z") };
    const relock: BoltAnchor = { kind: "lock", id: "relock", at: T("2026-07-21T12:20:00Z"), keyInBox: false };
    expect(derive({ anchors: [LOCK, CHECK_1, open, relock, CHECK_2] })).toEqual(["check1"]);
  });

  // ── Öffnungen als Ketten-Bruch ──
  it("belegt innerhalb einer Reinigungspause gar nichts", () => {
    const open: BoltAnchor = { kind: "open", id: "open", at: T("2026-07-21T12:00:00Z") };
    const during1 = check("d1", T("2026-07-21T12:05:00Z"));
    const during2 = check("d2", T("2026-07-21T12:10:00Z"));
    expect(derive({ anchors: [LOCK, open, during1, during2] })).toEqual([]);
  });

  it("nimmt die Kette nach dem Wiederverschluss wieder auf", () => {
    const open: BoltAnchor = { kind: "open", id: "open", at: T("2026-07-21T12:00:00Z") };
    const relock: BoltAnchor = { kind: "lock", id: "relock", at: T("2026-07-21T12:20:00Z"), keyInBox: true };
    expect(derive({ anchors: [LOCK, CHECK_1, open, relock, CHECK_2] })).toEqual(["check1", "check2"]);
  });

  it("lässt keine Beweiskette über ein Session-Ende laufen", () => {
    const sessionEnd: BoltAnchor = { kind: "open", id: "end", at: T("2026-07-21T18:00:00Z") };
    const nextCheck = check("next", T("2026-07-21T19:00:00Z"));
    expect(derive({ anchors: [LOCK, CHECK_1, sessionEnd, nextCheck] })).toEqual(["check1"]);
  });

  it("sortiert selbst — die Anker dürfen in beliebiger Reihenfolge kommen", () => {
    expect(derive({ anchors: [CHECK_2, LOCK, CHECK_1] })).toEqual(["check1", "check2"]);
  });

  it("liefert nichts ohne Kontrollen", () => {
    expect(derive({ anchors: [LOCK] })).toEqual([]);
  });
});

describe("keyProofFor", () => {
  const proven = new Set(["check1"]);

  it("nimmt das Foto-Urteil, wenn es eines gibt", () => {
    expect(keyProofFor("check1", true, "/api/uploads/box.jpg", proven)).toEqual({ keyDetected: true, keyProofSource: "photo" });
  });

  it("lässt ein Foto-NEIN stehen, auch wenn die Telemetrie den Eintrag belegt", () => {
    expect(keyProofFor("check1", false, "/api/uploads/box.jpg", proven)).toEqual({ keyDetected: false, keyProofSource: "photo" });
  });

  it("greift ohne Foto auf die Telemetrie zurück und nennt sie als Quelle", () => {
    expect(keyProofFor("check1", null, null, proven)).toEqual({ keyDetected: true, keyProofSource: "telemetry" });
  });

  it("bleibt stumm, solange ein vorhandenes Box-Foto noch kein Urteil hat", () => {
    // Sonst zeigte ausgerechnet die Zeile MIT Nachweisfoto „Telemetrie", bis die Erkennung nachträgt.
    expect(keyProofFor("check1", null, "/api/uploads/box.jpg", proven)).toEqual({ keyDetected: null, keyProofSource: null });
  });

  it("bleibt ohne Foto und ohne Telemetrie stumm — behauptet also nie „kein Schlüssel“", () => {
    expect(keyProofFor("check2", null, null, proven)).toEqual({ keyDetected: null, keyProofSource: null });
    expect(keyProofFor(null, undefined, null, proven)).toEqual({ keyDetected: null, keyProofSource: null });
  });
});

describe("sessionBoltAnchors", () => {
  it("nimmt Einschluss, erfasste Kontrollen, beide Seiten jeder Reinigungspause und das Session-Ende", () => {
    expect(
      sessionBoltAnchors({
        verschluss: { id: "lock", startTime: LOCK.at, keyInBox: true },
        oeffnen: { id: "end", startTime: T("2026-07-23T10:00:00Z") },
        kontrollen: [
          { entryId: "check1", time: CHECK_1.at, recordedAt: CHECK_1.at, keyDetected: true },
          { entryId: null, time: CHECK_2.at, recordedAt: CHECK_2.at }, // offene Anforderung ohne Eintrag
        ],
        interruptions: [{
          oeffnen: { id: "open", startTime: T("2026-07-21T12:00:00Z") },
          verschluss: { id: "relock", startTime: T("2026-07-21T12:20:00Z") },
        }],
      }),
    ).toEqual([
      { kind: "lock", id: "lock", at: LOCK.at, keyInBox: true },
      { kind: "inspection", id: "check1", at: CHECK_1.at, recordedAt: CHECK_1.at, keyDetected: true },
      { kind: "open", id: "open", at: T("2026-07-21T12:00:00Z") },
      { kind: "lock", id: "relock", at: T("2026-07-21T12:20:00Z"), keyInBox: null },
      { kind: "open", id: "end", at: T("2026-07-23T10:00:00Z") },
    ]);
  });

  it("lässt das Session-Ende weg, solange die Session läuft", () => {
    const anchors = sessionBoltAnchors({ verschluss: { id: "lock", startTime: LOCK.at, keyInBox: true }, oeffnen: null, kontrollen: [] });
    expect(anchors).toEqual([{ kind: "lock", id: "lock", at: LOCK.at, keyInBox: true }]);
  });
});
