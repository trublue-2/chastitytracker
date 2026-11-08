import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** Native Push-Tokens: angenommen werden nur Plattformen, an die die Instanz zustellen kann. */
const db = vi.hoisted(() => ({
  nativePushToken: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// Diese Instanz hat nur APNs eingerichtet.
vi.mock("@/lib/push", () => ({ isDeliverablePlatform: (p: unknown) => p === "ios" }));
vi.mock("@/lib/authGuards", () => ({
  requireApi: vi.fn(async () => ({ user: { id: "u1" } })),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/push/native-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/push/native-subscribe", () => {
  it("nimmt eine zustellbare Plattform an", async () => {
    const res = await post({ token: "t", platform: "ios" });
    expect(res.status).toBe(201);
    expect(db.nativePushToken.upsert).toHaveBeenCalledOnce();
  });

  it.each(["android", "web"])("lehnt %s ohne eingerichteten Versand mit stabilem Code ab und schreibt nichts", async (platform) => {
    const res = await post({ token: "t", platform });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "nativePlatformUnsupported" });
    expect(db.nativePushToken.upsert).not.toHaveBeenCalled();
  });

  it("verlangt Token und Plattform", async () => {
    expect((await post({ token: "t" })).status).toBe(400);
  });
});
