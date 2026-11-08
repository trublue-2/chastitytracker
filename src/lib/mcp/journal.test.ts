import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die KI liest das geteilte Tagebuch unter derselben Regel wie der Mensch: nur als ZUGEORDNETE
 * Keyholderin, und nur über den einen Lesepfad, der Privates gar nicht lädt.
 */
vi.mock("@/lib/keyholder", () => ({ canReadJournal: vi.fn() }));
vi.mock("@/lib/journal/journalService", () => ({ listKeyholderJournal: vi.fn() }));
vi.mock("./common", async (orig) => ({
  ...(await orig<typeof import("./common")>()),
  resolveUserContext: vi.fn(async () => ({ id: "sub1", timezone: "UTC" })),
}));

import { sharedJournal, SharedJournalDenied } from "./journal";
import { canReadJournal } from "@/lib/keyholder";
import { listKeyholderJournal } from "@/lib/journal/journalService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listKeyholderJournal).mockResolvedValue({
    entries: [
      { id: "a", entryAt: new Date("2026-03-12T21:05:00Z"), mood: 2, text: null, prompt: null, visibility: "MOOD_ONLY", lockedMs: 7_200_000, orgasmFreeMs: null },
    ],
    hasMore: false,
  });
});

describe("get_shared_journal", () => {
  it("der statische Token ohne Identität liest nichts", async () => {
    await expect(sharedJournal("sub", undefined, {})).rejects.toBeInstanceOf(SharedJournalDenied);
    expect(listKeyholderJournal).not.toHaveBeenCalled();
  });

  it("ein nicht zugeordnetes Konto (auch ein Admin) liest nichts", async () => {
    vi.mocked(canReadJournal).mockResolvedValue(false);
    await expect(sharedJournal("sub", "admin1", {})).rejects.toThrow(/not assigned as keyholder/);
    expect(listKeyholderJournal).not.toHaveBeenCalled();
  });

  it("die zugeordnete Keyholderin bekommt die geteilte Sicht samt Dauern in Stunden", async () => {
    vi.mocked(canReadJournal).mockResolvedValue(true);
    const r = await sharedJournal("sub", "kh1", { month: "2026-03" });
    expect(canReadJournal).toHaveBeenCalledWith("kh1", "sub1");
    expect(vi.mocked(listKeyholderJournal).mock.calls[0][1]?.range?.from?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(r.month).toBe("2026-03");
    expect(r.entries[0]).toMatchObject({ id: "a", shared: "mood_only", text: null, mood: 2, lockedHours: 2, orgasmFreeHours: null });
  });
});
