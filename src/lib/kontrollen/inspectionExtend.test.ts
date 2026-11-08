import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/shared/prisma", () => ({ prisma: {} }));

import { extendInspectionProblem } from "@/lib/kontrollen/kontrolleService";

const NOW = new Date("2026-10-17T20:00:00Z");
const H = 3_600_000;
const open = {
  entryId: null, withdrawnAt: null, autoMarkedRemovedAt: null,
  wirksamAb: null, benachrichtigtAt: new Date("2026-10-17T10:00:00Z"),
  deadline: new Date(NOW.getTime() - 2 * H),
};

describe("extendInspectionProblem", () => {
  it("erlaubt eine spätere Frist in der Zukunft — auch bei bereits überfälliger Kontrolle", () => {
    expect(extendInspectionProblem(open, new Date(NOW.getTime() + H), NOW)).toBeNull();
  });

  it("lehnt eine Frist ab, die in der Vergangenheit bliebe (Kontrolle wäre weiter überfällig)", () => {
    expect(extendInspectionProblem(open, new Date(NOW.getTime() - H), NOW)).toBe("INSPECTION_DEADLINE_NOT_LATER");
  });

  it("lehnt ein Vorziehen einer laufenden Frist ab", () => {
    const running = { ...open, deadline: new Date(NOW.getTime() + 5 * H) };
    expect(extendInspectionProblem(running, new Date(NOW.getTime() + 2 * H), NOW)).toBe("INSPECTION_DEADLINE_NOT_LATER");
    expect(extendInspectionProblem(running, new Date(NOW.getTime() + 6 * H), NOW)).toBeNull();
  });

  it.each([
    ["erfüllt", { entryId: "e1" }],
    ["zurückgezogen", { withdrawnAt: NOW }],
    ["von der Eskalation gebucht", { autoMarkedRemovedAt: NOW }],
    ["noch nicht zugestellt (terminiert)", { wirksamAb: new Date(NOW.getTime() + H), benachrichtigtAt: null }],
  ])("ist nicht verlängerbar: %s", (_name, patch) => {
    expect(extendInspectionProblem({ ...open, ...patch }, new Date(NOW.getTime() + H), NOW)).toBe("INSPECTION_NOT_EXTENDABLE");
  });
});
