import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Ohne `?userId=` die eigene Box. Mit `?userId=` koppelt und bedient die Keyholderin die LockMeBox ihres
 * Subs mit IHREM Handy: der Schritt läuft für den Sub, nie für die Handelnde — und nur, wenn sie ihn
 * führen darf.
 */
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ isKeyholderOf: vi.fn() }));
vi.mock("@/lib/constants", async (orig) => ({ ...(await orig<typeof import("@/lib/constants")>()), lockmeboxEnabled: vi.fn(() => true) }));
vi.mock("@/lib/lockmeboxService", () => ({ lockmeboxRelayStep: vi.fn() }));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { isKeyholderOf } from "@/lib/keyholder";
import { lockmeboxEnabled } from "@/lib/constants";
import { lockmeboxRelayStep } from "@/lib/lockmeboxService";

const SUB = "sub00000000000000000001";
const BODY = { boxId: "LOCKMEBOX-1234", line: null, sent: null };
const post = (body: unknown = BODY, query = `?userId=${SUB}`) =>
  POST(new NextRequest(`http://x/api/box/ble${query}`, { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockmeboxEnabled).mockReturnValue(true);
  vi.mocked(auth).mockResolvedValue({ user: { id: "kh", role: "user" } } as never);
  vi.mocked(lockmeboxRelayStep).mockResolvedValue({ ok: true, data: { send: null, problem: null, locked: false, info: null } } as never);
});

describe("POST /api/box/ble", () => {
  it("ohne userId: die eigene Box, ohne Keyholder-Prüfung", async () => {
    const res = await post(BODY, "");
    expect(res.status).toBe(200);
    expect(lockmeboxRelayStep).toHaveBeenCalledWith("kh", BODY);
    expect(isKeyholderOf).not.toHaveBeenCalled();
  });

  it("führt den Schritt für den Sub aus, wenn die Handelnde seine Keyholderin ist", async () => {
    vi.mocked(isKeyholderOf).mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(200);
    expect(lockmeboxRelayStep).toHaveBeenCalledWith(SUB, BODY);
  });

  it("lehnt eine fremde Keyholderin ab, ohne die Box anzufassen", async () => {
    vi.mocked(isKeyholderOf).mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(403);
    expect(lockmeboxRelayStep).not.toHaveBeenCalled();
  });

  it("gibt die Absage des Dienstes weiter — etwa eine zweite Box", async () => {
    vi.mocked(isKeyholderOf).mockResolvedValue(true);
    vi.mocked(lockmeboxRelayStep).mockResolvedValue({ ok: false, status: 409, error: "BOX_ONE_PER_USER" } as never);
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "BOX_ONE_PER_USER" });
  });

  it("gibt es auf einer Instanz ohne LockMeBox nicht", async () => {
    vi.mocked(isKeyholderOf).mockResolvedValue(true);
    vi.mocked(lockmeboxEnabled).mockReturnValue(false);
    const res = await post();
    expect(res.status).toBe(404);
    expect(lockmeboxRelayStep).not.toHaveBeenCalled();
  });

  it("lehnt eine ungültige Box-Nummer ab", async () => {
    vi.mocked(isKeyholderOf).mockResolvedValue(true);
    const res = await post({ ...BODY, boxId: "../x" });
    expect(res.status).toBe(400);
    expect(lockmeboxRelayStep).not.toHaveBeenCalled();
  });
});
