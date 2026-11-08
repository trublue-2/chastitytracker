import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Warum diese Frage zentral steht, erklärt `ownTracker.ts`. Hier hängt sie an Tests, weil zwei
 * Seiten sich auf dieselbe Antwort verlassen (Proxy und Kopfzeile) — und weil die Rollen-Vorprüfung
 * sonst unbemerkt verschwinden könnte: sie ändert den Rückgabewert NICHT, nur die Anzahl Abfragen.
 * Deshalb prüfen zwei Fälle nicht das Ergebnis, sondern dass gar nicht erst gefragt wurde.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { ownTrackerHidden } from "./ownTracker";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
});

/** Der Schalter steht in der DB auf `true`. */
function hidden() {
  db.user.findUnique.mockResolvedValue({ hideOwnTracker: true });
}

describe("ownTrackerHidden", () => {
  it("meldet den gesetzten Schalter beim Admin", async () => {
    hidden();
    expect(await ownTrackerHidden({ id: "u1", role: "admin" })).toBe(true);
  });

  it("meldet den gesetzten Schalter beim Keyholder ohne Admin-Rolle", async () => {
    hidden();
    expect(await ownTrackerHidden({ id: "u1", role: "user", controlsSubs: true })).toBe(true);
  });

  it("meldet `false`, wenn der Schalter aus ist", async () => {
    db.user.findUnique.mockResolvedValue({ hideOwnTracker: false });
    expect(await ownTrackerHidden({ id: "u1", role: "admin" })).toBe(false);
  });

  it("meldet `false`, wenn die Zeile fehlt (gelöschter Nutzer, gültiges Token)", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await ownTrackerHidden({ id: "u1", role: "admin" })).toBe(false);
  });

  it("fragt für einen reinen Sub gar nicht erst ab", async () => {
    hidden();
    expect(await ownTrackerHidden({ id: "u1", role: "user" })).toBe(false);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("fragt ohne id gar nicht erst ab", async () => {
    hidden();
    expect(await ownTrackerHidden({ role: "admin" })).toBe(false);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
