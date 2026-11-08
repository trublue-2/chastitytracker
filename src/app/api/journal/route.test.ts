import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Das eigene Tagebuch schreibt nur sein Besitzer. Der Scope kommt aus der Sitzung — ein `userId` im
 * Body (wie ihn `/api/weight` für die Keyholderin kennt) darf hier nichts bewirken.
 */
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/journal/journalService", () => ({
  createJournalEntry: vi.fn(async () => ({ ok: true, data: { id: "j1" } })),
  listOwnJournal: vi.fn(async () => ({ entries: [], hasMore: false })),
  updateJournalEntry: vi.fn(async () => ({ ok: true, data: null })),
  deleteJournalEntry: vi.fn(async () => ({ ok: true, data: null })),
}));

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
import { auth } from "@/lib/auth";
import { createJournalEntry, deleteJournalEntry, listOwnJournal, updateJournalEntry } from "@/lib/journal/journalService";

const req = (method: string, body?: string, path = "/api/journal") =>
  new NextRequest(`http://x${path}`, { method, ...(body !== undefined && { body }) });
const params = { params: Promise.resolve({ id: "j1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "sub1", role: "user", timezone: "Europe/Zurich" } } as never);
});

describe("/api/journal", () => {
  it("legt den Eintrag immer für die Sitzung an — ein userId im Body wird ignoriert", async () => {
    const res = await POST(req("POST", JSON.stringify({ userId: "fremd", text: "Hallo", mood: 3 })));
    expect(res.status).toBe(200);
    expect(vi.mocked(createJournalEntry).mock.calls[0][0]).toBe("sub1");
  });

  it("liest nur die eigene Liste, mit Monat und Cursor aus der Adresse", async () => {
    await GET(req("GET", undefined, "/api/journal?month=2026-03&cursor=j9&userId=fremd"));
    const [userId, page] = vi.mocked(listOwnJournal).mock.calls[0];
    expect(userId).toBe("sub1");
    expect(page?.cursor).toBe("j9");
    expect(page?.range?.from?.toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });

  it("ein unlesbarer Body ist 400, kein Serverfehler", async () => {
    expect((await POST(req("POST", "{kaputt"))).status).toBe(400);
    expect(createJournalEntry).not.toHaveBeenCalled();
  });

  it("ohne Anmeldung 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await POST(req("POST", JSON.stringify({ text: "x" })))).status).toBe(401);
  });
});

describe("/api/journal/[id]", () => {
  it("ändert und löscht nur über den Besitzer aus der Sitzung", async () => {
    await PATCH(req("PATCH", JSON.stringify({ userId: "fremd", visibility: "PRIVATE" }), "/api/journal/j1"), params);
    expect(vi.mocked(updateJournalEntry).mock.calls[0].slice(0, 2)).toEqual(["sub1", "j1"]);
    await DELETE(req("DELETE", undefined, "/api/journal/j1"), params);
    expect(deleteJournalEntry).toHaveBeenCalledWith("sub1", "j1");
  });

  it("reicht ein 404 des Dienstes (fremde oder unbekannte id) unverändert durch", async () => {
    vi.mocked(deleteJournalEntry).mockResolvedValueOnce({ ok: false, status: 404, error: "NOT_FOUND" });
    expect((await DELETE(req("DELETE", undefined, "/api/journal/j1"), params)).status).toBe(404);
  });
});
