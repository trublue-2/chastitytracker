import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `set_offense_rules` — welche Vergehensarten bei diesem Träger zählen.
 *
 * Gepinnt wird, was das Werkzeug ÜBER dem Dienst leistet: die vollständige Prüfung VOR dem ersten
 * Schreiben (eine halb angewandte Liste wäre ein Zustand, den niemand angefordert hat), und die
 * Vorschau, die auch nennt, was sich gar nicht bewegt.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, offenseRuleChange: { findMany: vi.fn() } },
}));
vi.mock("@/lib/offenseRulesService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offenseRulesService")>();
  return { ...actual, setOffenseRule: vi.fn().mockResolvedValue({ ok: true, data: null }) };
});

import { mcpSetOffenseRules } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { setOffenseRule } from "@/lib/offenseRulesService";

const setRuleMock = setOffenseRule as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1" });
  // Keine Historie: es gilt die Vorgabe je Art (OFFENSE_RULE_DEFAULT — „on" für die meisten,
  // „off" für das Gewicht und den unerlaubten Orgasmus).
  (prisma.offenseRuleChange.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  setRuleMock.mockResolvedValue({ ok: true, data: null });
});

describe("set_offense_rules", () => {
  it("verlangt überhaupt eine Regel", async () => {
    await expect(mcpSetOffenseRules("sub", { rules: [] })).rejects.toThrow(/at least one rule/);
  });

  it("legt mehrere Regeln in einem Aufruf um", async () => {
    await mcpSetOffenseRules("sub", { rules: [{ type: "late_control", mode: "on" }, { type: "cleaning_limit", mode: "on" }] });
    expect(setRuleMock).toHaveBeenCalledTimes(2);
    expect(setRuleMock.mock.calls[0][0]).toMatchObject({ offenseType: "late_control", mode: "on", changedBy: "ai" });
  });

  it("schreibt alle Regeln auf DENSELBEN Zeitpunkt", async () => {
    // Die tragende Zusage des Werkzeugs: mehrere Regeln sind eine Entscheidung, also ein Zeitpunkt
    // in der Historie. Ohne `now` von aussen setzte der Dienst je Aufruf eine eigene Uhrzeit.
    await mcpSetOffenseRules("sub", { rules: [{ type: "late_control", mode: "on" }, { type: "cleaning_limit", mode: "off" }] });
    expect(setRuleMock.mock.calls[0][0].now).toBe(setRuleMock.mock.calls[1][0].now);
  });

  it("weist dieselbe Art zweimal in einem Aufruf ab", async () => {
    // Sonst gewönne still der letzte Wert, und die Historie bekäme zwei Zeilen mit derselben Zeit.
    await expect(mcpSetOffenseRules("sub", {
      rules: [{ type: "late_control", mode: "on" }, { type: "late_control", mode: "off" }],
    })).rejects.toThrow(/appears more than once/);
    expect(setRuleMock).not.toHaveBeenCalled();
  });

  it("prüft ALLES vor dem ersten Schreiben", async () => {
    // Sonst stünde die erste Regel, die zweite nicht — ein Zustand, den niemand angefordert hat.
    await expect(mcpSetOffenseRules("sub", {
      rules: [{ type: "late_control", mode: "on" }, { type: "gibts_nicht", mode: "on" }],
    })).rejects.toThrow(/gibts_nicht: This kind of offence cannot be switched/);
    expect(setRuleMock).not.toHaveBeenCalled();
  });

  it("weist einen Modus ab, den diese Art nicht kennt — und nennt die erlaubten", async () => {
    // Der Kern-Satz kommt aus derselben Quelle wie die Service-Antwort (`enErrorText`), damit
    // dieselbe Regel nicht je nach Auffangort zwei Texte hat; die Werteliste kommt dazu.
    await expect(mcpSetOffenseRules("sub", { rules: [{ type: "late_control", mode: "lockedOnly" }] }))
      .rejects.toThrow(/This setting does not exist.*Allowed for this type: off, on/);
  });

  it("lässt die drei Modi der Orgasmus-Regel zu", async () => {
    await mcpSetOffenseRules("sub", { rules: [{ type: "unauthorized_orgasm", mode: "lockedOnly" }] });
    expect(setRuleMock.mock.calls[0][0]).toMatchObject({ mode: "lockedOnly" });
  });

  it("weist `manual_offense` ab — eine selbst notierte Tat verwirft man mit dem Urteil", async () => {
    await expect(mcpSetOffenseRules("sub", { rules: [{ type: "manual_offense", mode: "off" }] }))
      .rejects.toThrow(/cannot be switched on or off/);
  });

  it("nennt im dryRun, was schon gilt — sonst liest sich ein leerer Diff wie ein Fehlschlag", async () => {
    // `cleaning_limit` steht per Vorgabe auf „on"; der Dienst schriebe dafür keine Zeile.
    const res = await mcpSetOffenseRules("sub", {
      dryRun: true, rules: [{ type: "late_control", mode: "off" }, { type: "cleaning_limit", mode: "on" }],
    });
    expect(setRuleMock).not.toHaveBeenCalled();
    expect((res as { preview: Record<string, unknown> }).preview)
      .toMatchObject({ rules: { late_control: "off", cleaning_limit: "on" }, alreadyInEffect: ["cleaning_limit"] });
  });

  it("liest den geltenden Stand aus der Historie, nicht aus der Vorgabe", async () => {
    // Eine abgeschaltete Regel wieder abzuschalten bewegt nichts — das muss die Vorschau sagen,
    // sonst wirkt der leere Diff wie ein verschluckter Aufruf.
    (prisma.offenseRuleChange.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { offenseType: "late_control", mode: "off", effectiveFrom: new Date("2026-08-01T00:00:00Z") },
    ]);
    const res = await mcpSetOffenseRules("sub", { dryRun: true, rules: [{ type: "late_control", mode: "off" }] });
    expect((res as { preview: Record<string, unknown> }).preview).toMatchObject({ alreadyInEffect: ["late_control"] });
  });
});
