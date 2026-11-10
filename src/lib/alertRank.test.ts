import { describe, it, expect } from "vitest";
import { leadAlertKind, type AlertCandidate } from "./alertRank";

const c = (kind: AlertCandidate["kind"], dueAtMs: number | null, overdue = false): AlertCandidate => ({ kind, dueAtMs, overdue });

describe("leadAlertKind", () => {
  it("gibt nichts zurück, wenn nichts offen ist", () => {
    expect(leadAlertKind([])).toBeNull();
  });

  it("führt mit der knapperen Frist", () => {
    expect(leadAlertKind([c("inspection", 2000), c("lockRequest", 1000)])).toBe("lockRequest");
  });

  it("stellt Überfälliges vor eine knappere, noch nicht abgelaufene Frist", () => {
    expect(leadAlertKind([c("inspection", 1000), c("lockRequest", 5000, true)])).toBe("lockRequest");
  });

  it("entscheidet bei gleicher Frist für die Kontrolle", () => {
    expect(leadAlertKind([c("lockRequest", 1000), c("inspection", 1000)])).toBe("inspection");
  });

  it("lässt eine Anforderung ohne Frist hinter einer mit Frist", () => {
    expect(leadAlertKind([c("lockRequest", null), c("inspection", 9_000_000)])).toBe("inspection");
  });

  it("lässt das Orgasmus-Fenster nie vor einer Kontrolle oder Anforderung führen, aber allein", () => {
    expect(leadAlertKind([c("orgasm", 1), c("inspection", 9_000_000)])).toBe("inspection");
    expect(leadAlertKind([c("orgasm", 1, true), c("lockRequest", null)])).toBe("lockRequest");
    expect(leadAlertKind([c("orgasm", 1)])).toBe("orgasm");
  });
});
