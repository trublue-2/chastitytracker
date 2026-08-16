import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Aufnahme-Seite eines geforderten Nachweises.
 *
 * Sie ist der Weg, auf dem Beschreibung UND Code einer Aufgabe beim Träger ankommen — deshalb
 * entscheidet ihre Abfrage, nicht erst ihr Rendern, was er zu sehen bekommt. Eine terminierte, noch
 * nicht zugestellte Aufgabe existiert für ihn nicht; die Zeile darf gar nicht erst geladen werden.
 */

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", timezone: null } })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { taskProof: { findFirst: vi.fn() }, user: { findUnique: vi.fn(async () => null) } },
}));
// Die Formular-Komponente ist hier ohne Belang — geprüft wird, was die Seite lädt.
vi.mock("@/app/entries/TaskProofFormCore", () => ({ default: () => null }));

import TaskProofPage from "./page";
import { prisma } from "@/lib/prisma";

const find = prisma.taskProof.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("Nachweis-Seite — Sichtbarkeit", () => {
  it("fragt nur nach Nachweisen von Aufgaben, die der Träger überhaupt kennt", async () => {
    find.mockResolvedValue(null);

    await expect(TaskProofPage({ params: Promise.resolve({ id: "p1" }) }))
      .rejects.toThrow("REDIRECT:/dashboard");

    expect(find.mock.calls[0][0].where.task).toMatchObject({
      userId: "u1",
      // Das SQL-Gegenstück zu `isHiddenFromSub` — wörtlich, damit ein leeres Fragment auffällt.
      AND: [{ OR: [{ wirksamAb: null }, { benachrichtigtAt: { not: null } }] }],
    });
  });
});
