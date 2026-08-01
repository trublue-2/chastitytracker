import { describe, it, expect, vi, beforeEach } from "vitest";

// Factory-Import statt Top-Level-Variable: `vi.mock` wird an den Dateianfang gehoben, eine
// aussenstehende Konstante wäre dort noch nicht initialisiert (Muster aus dashboard.test.ts).
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/queries", () => ({ subsWithActiveSperrzeit: vi.fn() }));

import { buildAdminPasswordChangeRows } from "./passwordAudit";
import { prisma } from "@/lib/prisma";
import { subsWithActiveSperrzeit } from "@/lib/queries";
import { type PrismaMock } from "@/test/prismaMock";

const prismaMock = prisma as unknown as PrismaMock;
const activeLocks = vi.mocked(subsWithActiveSperrzeit);

const ADMIN = { id: "a1", username: "Admin", role: "admin" };
const SUB = { id: "s1", username: "Sub", role: "user" };
const LAUFENDE_SPERRZEIT = [{ id: "sp1", userId: "s1", endetAt: new Date("2026-08-02T10:00:00Z") }];

describe("buildAdminPasswordChangeRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeLocks.mockResolvedValue([]);
  });

  it("erfasst den Reset per Postfach-Token an einem Admin-Konto während einer Sperrzeit", async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN);
    activeLocks.mockResolvedValue(LAUFENDE_SPERRZEIT);

    const rows = await buildAdminPasswordChangeRows("a1", "reset_token", null);

    expect(rows).toEqual([{
      subUserId: "s1",
      adminUserId: "a1",
      adminUsername: "Admin",
      via: "reset_token",
      actorUserId: null,
      sperrzeitId: "sp1",
      sperrzeitEndetAt: LAUFENDE_SPERRZEIT[0].endetAt,
    }]);
  });

  // Der Zuschnitt des Features: ohne laufende Sperrzeit ist ein Passwortwechsel Alltag. Würde er
  // erfasst, ertränke der eine Eintrag, auf den es ankommt, im Rauschen.
  it("erfasst nichts, wenn keine Sperrzeit läuft", async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN);
    activeLocks.mockResolvedValue([]);

    expect(await buildAdminPasswordChangeRows("a1", "reset_token", null)).toEqual([]);
  });

  // Das Vergehen hängt am ADMIN-Konto: Ändert der Sub sein eigenes Passwort, verschafft er sich
  // keinen Zugang, den er nicht ohnehin hätte.
  it("erfasst nichts, wenn das Ziel kein Admin-Konto ist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(SUB);
    activeLocks.mockResolvedValue(LAUFENDE_SPERRZEIT);

    expect(await buildAdminPasswordChangeRows("s1", "self", "s1")).toEqual([]);
    // Gar nicht erst nach Sperrzeiten gefragt — die Rollenprüfung kommt zuerst.
    expect(activeLocks).not.toHaveBeenCalled();
  });

  it("erfasst nichts, wenn das Zielkonto nicht existiert", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    expect(await buildAdminPasswordChangeRows("weg", "set_by_other", "a1")).toEqual([]);
  });

  // Mehrere Subs unter einem Admin: Der Wechsel betrifft jeden, dessen Sperrzeit gerade läuft —
  // sonst hätte einer von beiden ein Vergehen und der andere nicht, bei identischem Vorgang.
  it("erzeugt je laufender Sperrzeit eine Zeile", async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN);
    activeLocks.mockResolvedValue([
      { id: "sp1", userId: "s1", endetAt: null },
      { id: "sp2", userId: "s2", endetAt: null },
    ]);

    const rows = await buildAdminPasswordChangeRows("a1", "set_by_other", "a1");

    expect(rows.map((r) => r.subUserId)).toEqual(["s1", "s2"]);
    expect(rows.every((r) => r.actorUserId === "a1")).toBe(true);
  });

  // Der Username wird als Abbild mitgeschrieben, nicht als Fremdschlüssel aufgelöst: Wird das
  // Admin-Konto später umbenannt oder gelöscht, bleibt nachvollziehbar, wessen Passwort es war.
  it("schreibt den Admin-Namen als Abbild mit", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...ADMIN, username: "Keyholder" });
    activeLocks.mockResolvedValue(LAUFENDE_SPERRZEIT);

    const [row] = await buildAdminPasswordChangeRows("a1", "self", "a1");

    expect(row.adminUsername).toBe("Keyholder");
  });
});
