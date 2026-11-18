import crypto from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Der Wechsel einer LockMeBox auf Heimdall (`firmwareSwapService.ts`). Gepinnt wird vor allem die
 * Reihenfolge: erst die Kopplung lösen (mit allen Bedingungen von „Box entfernen"), dann Heimdall
 * fragen, dann den Befehl bauen — und dass ein Fehlschlag unterwegs sauber als Code ankommt.
 */

const state = vi.hoisted(() => ({
  box: { kind: "lockmebox", name: "LOCKMEBOX-1" } as { kind: string; name: string } | null,
  removeResult: { ok: true, data: null } as { ok: true; data: null } | { ok: false; status: number; error: string },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boxStatus: { findUnique: vi.fn(async () => state.box) },
    user: { findUnique: vi.fn(async () => ({ username: "sub" })) },
  },
}));
vi.mock("@/lib/boxPairing", () => ({ removeBox: vi.fn(async () => state.removeResult) }));

import { firmwareSwapProgress, startFirmwareSwap } from "./firmwareSwapService";
import { removeBox } from "@/lib/boxPairing";

const KEY = "000102030405060708090a0b0c0d0e0f";
const INPUT = { boxId: "LOCKMEBOX-1", ssid: "Heim", password: "geheim123" };
const TAKEOVER = { deviceId: "dev1", provisionToken: "ABCD-EFGH", downloadUrl: "http://h.example/api/box/takeover/t0k", serverUrl: "https://h.example" };

function decrypt(frame: string): string {
  const body = Buffer.from(frame.slice(1, -1), "base64");
  const decipher = crypto.createDecipheriv("aes-128-cbc", Buffer.from(KEY, "hex"), body.subarray(0, 16));
  return Buffer.concat([decipher.update(body.subarray(16)), decipher.final()]).toString("utf8");
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  state.box = { kind: "lockmebox", name: "LOCKMEBOX-1" };
  state.removeResult = { ok: true, data: null };
  vi.stubEnv("BLE_BRIDGE_KEY", KEY);
  vi.stubEnv("HEIMDALL_SYNC_SECRET", "secret");
  vi.stubEnv("HEIMDALL_BASE_URL", "https://h.example/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(TAKEOVER), { status: 200 }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("startFirmwareSwap", () => {
  it("löst die Kopplung, holt die Adresse bei Heimdall und baut daraus den Update-Befehl", async () => {
    const result = await startFirmwareSwap("u1", INPUT);
    expect(removeBox).toHaveBeenCalledWith("u1", "LOCKMEBOX-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://h.example/api/tracker/takeover");
    expect(init.headers.authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toEqual({ username: "sub", name: "LOCKMEBOX-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [letter, b64url, b64ssid, b64pw] = decrypt(result.data.frame).split("/");
    expect(letter).toBe("U");
    expect(Buffer.from(b64url, "base64").toString()).toBe(TAKEOVER.downloadUrl);
    expect(Buffer.from(b64ssid, "base64").toString()).toBe("Heim");
    expect(Buffer.from(b64pw, "base64").toString()).toBe("geheim123");
    expect(result.data).toMatchObject({ deviceId: "dev1", provisionToken: "ABCD-EFGH", serverUrl: "https://h.example" });
  });

  it("liefert keinen Befehl, wenn die Box nicht entfernt werden darf", async () => {
    state.removeResult = { ok: false, status: 409, error: "BOX_REMOVE_BLOCKED" };
    expect(await startFirmwareSwap("u1", INPUT)).toMatchObject({ ok: false, status: 409, error: "BOX_SWAP_BLOCKED" });
  });

  it("nimmt nur eine LockMeBox", async () => {
    state.box = { kind: "heimdall", name: "Box" };
    expect(await startFirmwareSwap("u1", INPUT)).toMatchObject({ ok: false, error: "BOX_BLE_OTHER_BOX" });
    expect(removeBox).not.toHaveBeenCalled();
  });

  it("meldet eine schon angemeldete Heimdall-Box als eigenen Fall", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "DEVICE_EXISTS" }), { status: 409 }));
    expect(await startFirmwareSwap("u1", INPUT)).toMatchObject({ ok: false, status: 409, error: "BOX_SWAP_HEIMDALL_EXISTS" });
    // Heimdall sagt ab → die Kopplung bleibt.
    expect(removeBox).not.toHaveBeenCalled();
  });

  it("macht aus einem unerreichbaren Heimdall-Server einen 503", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await startFirmwareSwap("u1", INPUT)).toMatchObject({ ok: false, status: 503, error: "BOX_SWAP_UNAVAILABLE" });
    expect(removeBox).not.toHaveBeenCalled();
  });
});

describe("firmwareSwapProgress", () => {
  it("fragt Heimdall mit dem Usernamen des Trägers", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ downloaded: true, registered: false }), { status: 200 }));
    expect(await firmwareSwapProgress("u1", "dev1")).toEqual({ ok: true, data: { downloaded: true, registered: false } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://h.example/api/tracker/takeover/dev1?username=sub");
  });

  it("reicht ein fremdes Gerät als 404 durch", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await firmwareSwapProgress("u1", "dev1")).toMatchObject({ ok: false, status: 404 });
  });
});
