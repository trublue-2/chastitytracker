import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** Native Push-Tokens: nur iOS (APNs) wird angenommen; Android-Push (Legacy-FCM) ist abgeschaltet. */
const db = vi.hoisted(() => ({
  nativePushToken: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/authGuards", () => ({
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
  it("nimmt iOS an", async () => {
    const res = await post({ token: "t", platform: "ios" });
    expect(res.status).toBe(201);
    expect(db.nativePushToken.upsert).toHaveBeenCalledOnce();
  });

  it("lehnt Android mit stabilem Code ab und schreibt nichts", async () => {
    const res = await post({ token: "t", platform: "android" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "nativePlatformUnsupported" });
    expect(db.nativePushToken.upsert).not.toHaveBeenCalled();
  });

  it("verlangt Token und Plattform", async () => {
    expect((await post({ token: "t" })).status).toBe(400);
  });
});
