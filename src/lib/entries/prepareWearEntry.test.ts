import { describe, it, expect, vi } from "vitest";

/**
 * `prepareWearEntry` und „jetzt": ein Trage-Eintrag, den der Träger nicht datiert hat, rückt hinter den
 * vorherigen Eintrag, statt wegen einer Sekunden-Feinheit mit TIME_BEFORE abgewiesen zu werden — wie
 * bei Verschluss und Öffnung (`entryStart.ts`). Eine von Hand gewählte Zeit wird nie verschoben.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { prepareWearEntry, type PrismaTx } from "./queries";

const BEGIN = new Date("2026-07-10T10:06:10Z"); // vorheriger Eintrag, mit Sekunden
const FORM_MINUTE = "2026-07-10T10:06:00.000Z"; // Formular: Minute, Sekunden 0

const txWithLatest = (latest: { type: string; startTime: Date } | null) => ({
  device: { findUnique: vi.fn().mockResolvedValue({ categoryId: "c1", category: { isBuiltIn: false, requirePhoto: false } }) },
  entry: { findFirst: vi.fn().mockResolvedValue(latest) },
}) as unknown as PrismaTx;

describe("prepareWearEntry und jetzt", () => {
  const run = (startTime: string, isNow: boolean) =>
    prepareWearEntry(txWithLatest({ type: "WEAR_BEGIN", startTime: BEGIN }), "u1", "WEAR_END", "d1", startTime, null, isNow);

  it("rückt ein jetzt auf oder vor dem vorherigen Eintrag eine Millisekunde dahinter", async () => {
    expect(await run(FORM_MINUTE, true)).toMatchObject({ ok: true, start: new Date(BEGIN.getTime() + 1) });
  });

  it("weist dieselbe Zeit von Hand weiterhin mit TIME_BEFORE ab", async () => {
    expect(await run(FORM_MINUTE, false)).toEqual({ ok: false, code: "TIME_BEFORE" });
  });

  it("lässt eine Zeit nach dem vorherigen Eintrag unverändert", async () => {
    const later = "2026-07-10T11:00:00.000Z";
    expect(await run(later, true)).toMatchObject({ ok: true, start: new Date(later) });
  });
});
