import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Wer das Tagebuch eines Subs lesen darf. Die Grenze ist strenger als überall sonst unter
 * `/api/admin/users/[id]`: nur die ZUGEORDNETE Keyholderin, nicht schon die Admin-Rolle. Getestet
 * wird deshalb der echte Guard (`requireJournalReaderApi`), nicht ein Mock davon — nur Sitzung und
 * Zuordnung sind gestellt.
 */
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ canReadJournal: vi.fn(), isKeyholderOf: vi.fn(), getControllableSubsCached: vi.fn() }));
vi.mock("@/lib/journal/journalService", () => ({ listKeyholderJournal: vi.fn(async () => ({ entries: [], hasMore: false })) }));
vi.mock("@/lib/queries", () => ({ getUserTimezone: vi.fn(async () => "Europe/Zurich") }));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { canReadJournal } from "@/lib/keyholder";
import { listKeyholderJournal } from "@/lib/journal/journalService";

const SUB = "sub00000000000000000001";
const call = (query = "") =>
  GET(new NextRequest(`http://x/api/admin/users/${SUB}/journal${query}`), { params: Promise.resolve({ id: SUB }) });

function signIn(id: string, role: "user" | "admin") {
  vi.mocked(auth).mockResolvedValue({ user: { id, role } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/users/[id]/journal", () => {
  it("die zugeordnete Keyholderin liest", async () => {
    signIn("kh1", "user");
    vi.mocked(canReadJournal).mockResolvedValue(true);
    const res = await call();
    expect(res.status).toBe(200);
    expect(canReadJournal).toHaveBeenCalledWith("kh1", SUB);
    expect(listKeyholderJournal).toHaveBeenCalledWith(SUB, { range: {}, cursor: undefined });
  });

  it("der globale Admin OHNE Zuordnung liest nichts — die Rolle allein genügt hier nicht", async () => {
    signIn("admin1", "admin");
    vi.mocked(canReadJournal).mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(listKeyholderJournal).not.toHaveBeenCalled();
  });

  it("ein Admin, der zugleich zugeordnet ist, liest als Keyholder", async () => {
    signIn("admin1", "admin");
    vi.mocked(canReadJournal).mockResolvedValue(true);
    expect((await call()).status).toBe(200);
  });

  it("ohne Anmeldung 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await call()).status).toBe(401);
    expect(listKeyholderJournal).not.toHaveBeenCalled();
  });

  it("reicht den Monat in der Zeitzone des Subs durch", async () => {
    signIn("kh1", "user");
    vi.mocked(canReadJournal).mockResolvedValue(true);
    await call("?month=2026-03");
    const page = vi.mocked(listKeyholderJournal).mock.calls[0][1];
    expect(page?.range?.from?.toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });
});
