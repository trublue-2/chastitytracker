import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const createEntryGapForUser = vi.fn();
vi.mock("@/lib/entryGapService", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entryGapService")>("@/lib/entryGapService");
  return { ...actual, createEntryGapForUser: (...a: unknown[]) => createEntryGapForUser(...a) };
});
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => ({ id: "u1", orgasmusArtenConfig: null, oeffnenGruendeConfig: null })) } } }));
vi.mock("@/lib/auth/authGuards", () => ({ requireKeyholderOrAdminActor: vi.fn(async () => ({ user: { id: "kh" } })) }));
vi.mock("@/lib/client/devMode", () => ({ isDevBypassEnabled: () => false }));

import { POST } from "./route";

const post = (body: object) =>
  POST(new NextRequest("http://x/api/admin/entries/gap", { method: "POST", body: JSON.stringify(body), headers: { host: "x" } }));
const BODY = {
  userId: "u1", openAt: "2026-10-01T10:00:00.000Z", lockAt: "2026-10-01T12:00:00.000Z", oeffnenGrund: "KEYHOLDER", note: "n",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ALLOW_ENTRY_GAP = "true";
  createEntryGapForUser.mockResolvedValue({ ok: true, opened: { id: "o" }, locked: { id: "l" } });
});

describe("POST /api/admin/entries/gap", () => {
  it("ist ohne ALLOW_ENTRY_GAP gesperrt", async () => {
    delete process.env.ALLOW_ENTRY_GAP;
    expect((await post(BODY)).status).toBe(403);
    expect(createEntryGapForUser).not.toHaveBeenCalled();
  });

  it("ohne kind gilt die Pause (Bestandsverhalten)", async () => {
    expect((await post(BODY)).status).toBe(201);
    expect(createEntryGapForUser.mock.calls[0][1]).toMatchObject({ kind: "break" });
  });

  it("reicht kind session an den Dienst", async () => {
    expect((await post({ ...BODY, kind: "session" })).status).toBe(201);
    expect(createEntryGapForUser.mock.calls[0][1]).toMatchObject({ kind: "session" });
  });

  it("lehnt eine unbekannte Art ab", async () => {
    const res = await post({ ...BODY, kind: "wear" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_TYPE");
    expect(createEntryGapForUser).not.toHaveBeenCalled();
  });

  it("gibt die Absage des Dienstes als 400 zurück", async () => {
    createEntryGapForUser.mockResolvedValue({ ok: false, error: "GAP_NOT_OPEN" });
    const res = await post({ ...BODY, kind: "session" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("GAP_NOT_OPEN");
  });
});
