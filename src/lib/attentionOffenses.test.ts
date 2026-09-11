import { describe, it, expect, vi } from "vitest";

// `attentionOffensesOf` ist rein — die Mocks halten nur die Modulkette (strafbuch → prisma,
// strafurteilService → notify/taskService) vom Laden ab. Dieselben wie in `subOffenses.test.ts`.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/taskService", () => ({ checkTask: vi.fn(), writeTask: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

import { attentionOffensesOf, type SubOffense } from "./subOffenses";

const offense = (refId: string, state: SubOffense["state"]) =>
  ({ refId, state } as Partial<SubOffense> as SubOffense);

/**
 * Was die Keyholderin auf der Sub-Übersicht sieht. Anlass (11.09.2026): eine verhängte Freitext-Strafe
 * fiel mit dem Urteil von ihrer Übersicht, stand beim Träger aber weiter als offen.
 */
describe("attentionOffensesOf", () => {
  it("zeigt Unbeurteiltes UND offene Strafen — Erledigtes und Verworfenes nicht", () => {
    const rows = [
      offense("bestraft", "punished"), offense("offen-1", "open"), offense("erledigt", "done"),
      offense("verworfen", "dismissed"), offense("offen-2", "open"),
    ];
    expect(attentionOffensesOf(rows).map((o) => o.refId)).toEqual(["offen-1", "offen-2", "bestraft"]);
  });
});
