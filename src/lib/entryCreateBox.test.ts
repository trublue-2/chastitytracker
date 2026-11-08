import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Eine Öffnung, die die Keyholderin einträgt, ist ein AUFTRAG an die Box — nicht bloss eine Notiz
 * (Vorfall 18.10.2026: der Tracker stand auf „offen", die LockMeBox blieb zu, und kein Befehl war je
 * entstanden, weil dieser Pfad `setBoxCommandForUser` nie rief).
 *
 * Festgenagelt wird die Naht: WANN gibt der Dienst der Box das Kommando, wann wartet die Öffnung auf
 * den Riegel, und was bleibt Dokumentation. Die Regeln dahinter (`boxCommandForEntry`,
 * `openAwaitsBolt`) haben ihre eigenen Tests.
 */

const tx = { entry: { create: vi.fn() }, verschlussAnforderung: { updateMany: vi.fn() } };
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)) },
}));
vi.mock("@/lib/queries", () => ({
  endableLockPeriods: (userId: string) => ({ userId, art: "SPERRZEIT" }),
  validateDeviceOwnership: vi.fn(),
  releaseLockPeriodsOnOpen: vi.fn(),
  prepareWearEntry: vi.fn(),
  getKgNeighbors: vi.fn(),
}));
vi.mock("@/lib/entryFulfilment", () => ({ applyEntryFulfilment: vi.fn(async () => []) }));
vi.mock("@/lib/kontrollen/autoKontrolleService", () => ({ triggerPostLockInspection: vi.fn() }));
vi.mock("@/lib/lockCommit", () => ({
  findPendingLockTx: vi.fn(async () => null),
  findPendingOpenTx: vi.fn(async () => null),
  openAwaitsBolt: vi.fn(async () => false),
}));
vi.mock("@/lib/box/boxCommand", async (orig) => ({ ...(await orig<object>()), setBoxCommandForUser: vi.fn(async () => true) }));
vi.mock("@/lib/box/boxCommandNotify", () => ({ announceBoxCommand: vi.fn() }));
vi.mock("@/lib/messages/entryNotify", () => ({ notifyControllersAboutEntry: vi.fn() }));

import { createEntryForUser } from "./entryCreateService";
import { getKgNeighbors, releaseLockPeriodsOnOpen } from "@/lib/queries";
import { applyEntryFulfilment } from "@/lib/entryFulfilment";
import { findPendingOpenTx, openAwaitsBolt } from "@/lib/lockCommit";
import { setBoxCommandForUser } from "@/lib/box/boxCommand";
import { announceBoxCommand } from "@/lib/box/boxCommandNotify";
import { notifyControllersAboutEntry } from "@/lib/messages/entryNotify";
import type { User } from "@prisma/client";

const fn = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

const USER = { id: "u1", username: "sub", orgasmusArtenConfig: null, oeffnenGruendeConfig: null } as unknown as User;
const LOCK = { id: "l1", type: "VERSCHLUSS", startTime: new Date("2026-10-06T10:10:00Z"), keyInBox: true };
const AFTER = { id: "o2", type: "VERSCHLUSS", startTime: new Date("2026-10-17T10:00:00Z") };
const OPEN = { type: "OEFFNEN", startTime: "2026-10-10T11:58:00Z", oeffnenGrund: "KEYHOLDER", note: "box öffnen" };
const OPTS = { actorUserId: "admin1", allowFuture: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLE_BRIDGE_KEY", "000102030405060708090a0b0c0d0e0f");
  fn(getKgNeighbors).mockResolvedValue({ prev: LOCK, next: null });
  fn(releaseLockPeriodsOnOpen).mockResolvedValue(false);
  fn(findPendingOpenTx).mockResolvedValue(null);
  fn(openAwaitsBolt).mockResolvedValue(false);
  fn(setBoxCommandForUser).mockResolvedValue(true);
  tx.entry.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "e1", ...data }));
});
afterEach(() => vi.unstubAllEnvs());

describe("createEntryForUser — Öffnung und Box", () => {
  it("gibt der Box den Öffnen-Befehl und sagt ihn an, sobald die Öffnung der aktuelle Zustand wird", async () => {
    const res = await createEntryForUser(USER, OPEN, OPTS);
    expect(res.ok).toBe(true);
    expect(setBoxCommandForUser).toHaveBeenCalledWith(tx, "u1", "open");
    expect(announceBoxCommand).toHaveBeenCalledWith("u1", "open");
  });

  it("die LockMeBox wartet auf den Riegel: Eintrag schwebt, nichts wird abgehakt, nichts gemeldet", async () => {
    fn(openAwaitsBolt).mockResolvedValue(true);
    const res = await createEntryForUser(USER, OPEN, OPTS);
    expect(res.ok && res.entry).toMatchObject({ openAwaitsBolt: true });
    // Den Vollzug (`commitPendingOpen`) holt all das nach, sobald die Box „Riegel offen" meldet.
    expect(applyEntryFulfilment).not.toHaveBeenCalled();
    expect(notifyControllersAboutEntry).not.toHaveBeenCalled();
    expect(setBoxCommandForUser).toHaveBeenCalledWith(tx, "u1", "open");
  });

  it("ohne Warten (Heimdall) gilt die Öffnung sofort und wird gemeldet", async () => {
    const res = await createEntryForUser(USER, OPEN, OPTS);
    expect(res.ok && res.entry).toMatchObject({ openAwaitsBolt: false });
    expect(applyEntryFulfilment).toHaveBeenCalledTimes(1);
    expect(notifyControllersAboutEntry).toHaveBeenCalledTimes(1);
  });

  it("liegt die Öffnung zwischen einem bestehenden Paar, bleibt sie Dokumentation: kein Befehl", async () => {
    // Die Box steht längst anders — ein Kommando von heute träfe den Zustand von gestern nicht.
    fn(getKgNeighbors).mockResolvedValue({ prev: LOCK, next: AFTER });
    const res = await createEntryForUser(USER, OPEN, OPTS);
    expect(res.ok).toBe(true);
    expect(openAwaitsBolt).not.toHaveBeenCalled();
    expect(setBoxCommandForUser).not.toHaveBeenCalled();
    expect(announceBoxCommand).not.toHaveBeenCalled();
  });

  it("eine Sperrbruch-Öffnung bekommt keinen Befehl — die Box bleibt mit Absicht zu", async () => {
    fn(releaseLockPeriodsOnOpen).mockResolvedValue(true);
    const res = await createEntryForUser(USER, OPEN, OPTS);
    expect(res.ok).toBe(true);
    expect(setBoxCommandForUser).not.toHaveBeenCalled();
    expect(announceBoxCommand).not.toHaveBeenCalled();
  });

  it("sagt nichts an, wenn gar keine Box ein Kommando bekam", async () => {
    fn(setBoxCommandForUser).mockResolvedValue(false);
    await createEntryForUser(USER, OPEN, OPTS);
    expect(announceBoxCommand).not.toHaveBeenCalled();
  });

  it("lehnt eine zweite Öffnung ab, solange die erste auf den Riegel wartet", async () => {
    fn(findPendingOpenTx).mockResolvedValue({ id: "pending" });
    const res = await createEntryForUser(USER, OPEN, OPTS);
    expect(res).toEqual({ ok: false, error: "OPEN_ALREADY_PENDING" });
    expect(tx.entry.create).not.toHaveBeenCalled();
  });

  it("öffnet die KEYHOLDERIN, ist es eine Freigabe: Sperrzeit endet als released, Box bekommt den Befehl", async () => {
    // Auch wenn `releaseLockPeriodsOnOpen` danach nichts mehr findet: hier steht, dass NICHT sie es
    // war, die die Sperrzeit gebrochen hat — sonst bliebe die Box zu und der Träger „offen".
    await createEntryForUser(USER, OPEN, OPTS);
    expect(tx.verschlussAnforderung.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ endedReason: "released", withdrawnAt: expect.any(Date) }),
    }));
    expect(setBoxCommandForUser).toHaveBeenCalledWith(tx, "u1", "open");
  });

  it("die KI-Keyholderin (kein Handelnder) gibt dieselbe Freigabe", async () => {
    await createEntryForUser(USER, OPEN, { actorUserId: null, allowFuture: true });
    expect(tx.verschlussAnforderung.updateMany).toHaveBeenCalledTimes(1);
  });

  it("öffnet der Träger für SICH SELBST, bleibt es beim Bruch: keine Freigabe", async () => {
    await createEntryForUser(USER, OPEN, { actorUserId: "u1", allowFuture: true });
    expect(tx.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
  });

  it("eine Reinigung der Keyholderin lässt die Sperrzeit laufen", async () => {
    await createEntryForUser(USER, { ...OPEN, oeffnenGrund: "REINIGUNG" }, OPTS);
    expect(tx.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
  });

  it("eine zwischen ein altes Paar nachgetragene Öffnung beendet keine heutige Sperrzeit", async () => {
    fn(getKgNeighbors).mockResolvedValue({ prev: LOCK, next: AFTER });
    await createEntryForUser(USER, OPEN, OPTS);
    expect(tx.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
  });

  it("ein VERSCHLUSS gibt auf diesem Pfad weiterhin kein Kommando und wartet nie", async () => {
    fn(getKgNeighbors).mockResolvedValue({ prev: { ...LOCK, type: "OEFFNEN" }, next: null });
    const res = await createEntryForUser(USER, { type: "VERSCHLUSS", startTime: "2026-10-12T10:00:00Z" }, OPTS);
    expect(res.ok && res.entry).toMatchObject({ openAwaitsBolt: false });
    expect(setBoxCommandForUser).not.toHaveBeenCalled();
  });
});
