import { describe, it, expect, vi, beforeEach } from "vitest";

// Factory-Import statt Top-Level-Variable: `vi.mock` wird an den Dateianfang gehoben.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { setOffenseRule } from "./offenseRulesService";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const prismaMock = prisma as unknown as PrismaMock;

const NOW = new Date("2026-08-11T12:00:00Z");
const BASE = { userId: "u1", changedBy: "Keyholder", now: NOW };

/** Eine Zeile, wie sie der Service aus `OffenseRuleChange` liest. */
const change = (offenseType: string, mode: string, iso: string) =>
  ({ offenseType, mode, effectiveFrom: new Date(iso) });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.offenseRuleChange.findMany.mockResolvedValue([]);
  prismaMock.offenseRuleChange.create.mockResolvedValue({ id: "c1" });
});

describe("setOffenseRule", () => {
  it("schreibt eine neue Zeile mit effectiveFrom = jetzt", async () => {
    const res = await setOffenseRule({ ...BASE, offenseType: "late_control", mode: "off" });

    expect(res).toEqual({ ok: true, data: null });
    expect(prismaMock.offenseRuleChange.create).toHaveBeenCalledWith({
      data: { userId: "u1", offenseType: "late_control", mode: "off", effectiveFrom: NOW, changedBy: "Keyholder" },
    });
  });

  // Der Kern der Historie: sie hält Änderungen fest, nicht jeden Klick. Ohne diese Prüfung stünde
  // in der Tabelle irgendwann ein „Umlegen", das nichts umgelegt hat — mit falschem `changedBy`.
  it("schreibt NICHTS, wenn der Modus schon der geltende ist", async () => {
    prismaMock.offenseRuleChange.findMany.mockResolvedValue([
      change("late_control", "off", "2026-08-01T00:00:00Z"),
    ]);

    const res = await setOffenseRule({ ...BASE, offenseType: "late_control", mode: "off" });

    expect(res).toEqual({ ok: true, data: null });
    expect(prismaMock.offenseRuleChange.create).not.toHaveBeenCalled();
  });

  it("erkennt den Default als geltenden Modus — Einschalten einer ohnehin geltenden Art schreibt nichts", async () => {
    const res = await setOffenseRule({ ...BASE, offenseType: "late_control", mode: "on" });

    expect(res).toEqual({ ok: true, data: null });
    expect(prismaMock.offenseRuleChange.create).not.toHaveBeenCalled();
  });

  it("schreibt wieder, wenn nach einem Aus erneut eingeschaltet wird", async () => {
    prismaMock.offenseRuleChange.findMany.mockResolvedValue([
      change("late_control", "off", "2026-08-01T00:00:00Z"),
    ]);

    const res = await setOffenseRule({ ...BASE, offenseType: "late_control", mode: "on" });

    expect(res).toEqual({ ok: true, data: null });
    expect(prismaMock.offenseRuleChange.create).toHaveBeenCalled();
  });

  it("lehnt eine nicht schaltbare Art ab, ohne die DB anzufassen", async () => {
    const res = await setOffenseRule({ ...BASE, offenseType: "manual_offense", mode: "off" });

    expect(res).toEqual({ ok: false, status: 400, error: "OFFENSE_TYPE_NOT_SWITCHABLE" });
    expect(prismaMock.offenseRuleChange.findMany).not.toHaveBeenCalled();
    expect(prismaMock.offenseRuleChange.create).not.toHaveBeenCalled();
  });

  it("lehnt einen Modus ab, den DIESE Art nicht kennt", async () => {
    const res = await setOffenseRule({ ...BASE, offenseType: "late_control", mode: "lockedOnly" });

    expect(res).toEqual({ ok: false, status: 400, error: "OFFENSE_MODE_INVALID" });
    expect(prismaMock.offenseRuleChange.create).not.toHaveBeenCalled();
  });

  it("nimmt die dreistufigen Modi der Orgasmus-Art an", async () => {
    const res = await setOffenseRule({ ...BASE, offenseType: "unauthorized_orgasm", mode: "lockedOnly" });

    expect(res).toEqual({ ok: true, data: null });
    expect(prismaMock.offenseRuleChange.create).toHaveBeenCalledWith({
      data: { userId: "u1", offenseType: "unauthorized_orgasm", mode: "lockedOnly", effectiveFrom: NOW, changedBy: "Keyholder" },
    });
  });
});
