import { describe, it, expect, vi } from "vitest";

/**
 * Der Vertrag, den `get_offenses` gebrochen hat (gemeldet 11.07.2026):
 *
 *   Das Dashboard meldete `detectedOffenseCount: 14` und ein OFFENES Vergehen — `get_offenses` gab
 *   11 Zeilen zurück, alle `judged`. Das offene fehlte. Ohne Zeile keine `ref`, ohne `ref` kein
 *   `judge_offense`: das Vergehen war sichtbar, aber nicht beurteilbar.
 *
 * Ursache: `collectDetectedOffenses` ZÄHLT neun Kategorien, der Ledger GAB acht aus.
 * `autoRemovedControls` (Kontrolle nie beantwortet → System buchte „Gerät vermutlich abgenommen")
 * fiel durch. Es war keine falsche Zeile — es war eine fehlende.
 *
 * Diese Tests halten Zähler und Ausgabe aneinander fest, damit die zehnte Kategorie nicht wieder
 * still verschwindet.
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildOffenseRows, filterOffenses, OFFENSE_TYPES, type OffenseRow } from "./ledger";
import { collectDetectedOffenses, STORED_TYPE, type OffenseCanonicalType } from "@/lib/strafurteilService";

/** Eine `mcpStrafbuch`-Ausgabe mit GENAU EINEM Eintrag in jeder Kategorie. */
function strafbuchWithOneOfEach() {
  const j = (type: OffenseCanonicalType, id: string) => ({
    ref: { type, id },
    judgment: "open" as const,
    penalty: null, done: false, doneAt: null, reason: null, judgedBy: null, judgedAt: null,
  });
  return {
    unauthorizedOpenings: [{ ...j("unauthorized_opening", "o1"), time: "t", note: null, lockPeriodEndedAt: null, lockPeriodIndefinite: false }],
    lateControls: [{ ...j("late_control", "k1"), entryTime: "t", deadline: "d", fulfilledAt: null, backdated: false, comment: null, entryNote: null }],
    rejectedControls: [{ ...j("rejected_control", "k2"), entryTime: "t", deadline: "d", fulfilledAt: null, comment: null, entryNote: null }],
    autoRemovedControls: [{ ...j("auto_removed_control", "k3"), entryTime: "t", deadline: "d", fulfilledAt: null, comment: null, entryNote: null }],
    cleaningLimitViolations: [{ ...j("cleaning_limit", "e1"), time: "t", note: null }],
    wrongDeviceViolations: [{ ...j("wrong_device", "e2"), time: "t", note: null, deviceName: "Käfig A" }],
    missedOrgasmInstructions: [{ ...j("missed_orgasm", "m1"), windowEndedAt: "t", message: null, requiredType: null }],
    lateLocks: [{ ...j("late_lock", "v1"), deadline: "d", fulfilledAt: null, message: null }],
    cleaningNotRelocked: [{ ...j("cleaning_not_relocked", "relock:e1"), time: "t", deadline: "d", relockedAt: null, note: null }],
    detectedOffenseCount: 9, openOffenseCount: 9, pendingPenaltyCount: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** Dieselben Kategorien in der Zähl-Form (`buildStrafbuch`-Rohdaten, nicht MCP-Form). */
function rawStrafbuchWithOneOfEach() {
  const one = { startTime: null, deadline: null, entryStartTime: null, endetAt: null, fulfilledAt: null, relockAt: null };
  return {
    unauthorizedOpenings: [{ id: "o1", ...one }],
    lateControls: [{ id: "k1", ...one }],
    rejectedControls: [{ id: "k2", ...one }],
    autoRemovedControls: [{ id: "k3", ...one }],
    reinigungLimitViolations: [{ entryId: "e1", ...one }],
    wrongDeviceViolations: [{ entryId: "e2", ...one }],
    missedOrgasmInstructions: [{ id: "m1", ...one }],
    lateLocks: [{ id: "v1", ...one }],
    cleaningNotRelocked: [{ entryId: "e1", ...one }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("Offense-Taxonomie", () => {
  it("OFFENSE_TYPES ist die Wahrheit aus STORED_TYPE, keine handgeführte Kopie", () => {
    expect(OFFENSE_TYPES).toEqual(Object.keys(STORED_TYPE));
    expect(OFFENSE_TYPES).toContain("auto_removed_control");
  });
});

describe("buildOffenseRows — Zähler und Ausgabe dürfen nicht auseinanderlaufen", () => {
  it("KERN-BUG 11.07.: gibt JEDE gezählte Kategorie auch aus", () => {
    const counted = new Set(collectDetectedOffenses(rawStrafbuchWithOneOfEach()).map((o) => o.canonicalType));
    const emitted = new Set(buildOffenseRows(strafbuchWithOneOfEach(), new Map()).map((r) => r.type));

    // Vor dem Fix: counted hatte 9 Typen, emitted 8 — auto_removed_control fehlte.
    expect([...emitted].sort()).toEqual([...counted].sort());
    expect(emitted.size).toBe(OFFENSE_TYPES.length);
  });

  it("die vermutete Geräte-Abnahme trägt eine ref, mit der judge_offense arbeiten kann", () => {
    const rows = buildOffenseRows(strafbuchWithOneOfEach(), new Map());
    const autoRemoved = rows.find((r) => r.type === "auto_removed_control");

    expect(autoRemoved).toBeDefined();
    expect(autoRemoved!.id).toBe("k3");
    expect(autoRemoved!.status).toBe("open");
  });

  it("hängt bei wrong_device den Cluster des getragenen Geräts an", () => {
    const rows = buildOffenseRows(
      strafbuchWithOneOfEach(),
      new Map([["Käfig A", { lookalikeClusterId: "c1", securityLevel: "low" }]]),
    );
    const wrongDevice = rows.find((r) => r.type === "wrong_device")!;

    expect(wrongDevice.context.deviceCluster).toBe("c1");
    expect(wrongDevice.context.possiblyClusterInternal).toBe(true);
  });
});

// K-14 (MCP-Restliste 2026-07-17): get_offenses wächst monoton — filterOffenses grenzt ein.
describe("filterOffenses — K-14", () => {
  const row = (over: Partial<OffenseRow>): OffenseRow => ({
    id: "x", type: "late_control", detectedAt: "2026-07-10T10:00:00+02:00", status: "judged",
    judgment: "dismissed", consequence: null, dismissReason: null, judgedBy: null, judgedAt: null,
    context: {}, notes: [], ...over,
  });
  const rows: OffenseRow[] = [
    row({ id: "a", type: "late_control", status: "open", detectedAt: "2026-07-01T10:00:00+02:00" }),
    row({ id: "b", type: "wrong_device", status: "judged", detectedAt: "2026-07-15T10:00:00+02:00" }),
    row({ id: "c", type: "late_control", status: "judged", detectedAt: null }),
  ];

  it("type filtert auf einen Vergehenstyp", () => {
    expect(filterOffenses(rows, { type: "wrong_device" }).map((r) => r.id)).toEqual(["b"]);
  });
  it("openOnly liefert nur status open", () => {
    expect(filterOffenses(rows, { openOnly: true }).map((r) => r.id)).toEqual(["a"]);
  });
  it("from/to grenzt auf detectedAt ein und wirft Zeilen ohne detectedAt raus", () => {
    expect(filterOffenses(rows, { from: "2026-07-10T00:00:00+02:00" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterOffenses(rows, { to: "2026-07-05T00:00:00+02:00" }).map((r) => r.id)).toEqual(["a"]);
  });
  it("limit sortiert neueste zuerst und kürzt", () => {
    expect(filterOffenses(rows, { limit: 1 }).map((r) => r.id)).toEqual(["b"]); // 15.07. ist neuester
  });
});
