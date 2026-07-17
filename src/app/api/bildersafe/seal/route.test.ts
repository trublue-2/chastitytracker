import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Der Guard der Versiegelungs-Route. Drei Schranken, alle sicherheitsrelevant: das Feature-Flag
 * (ENABLE_BILDERSAFE — ohne Flag existiert die Route nach aussen nicht), die URL-Whitelist (nur
 * eigene Upload-Pfade, keine externen URLs in die DB) und der Zustand (versiegeln nur am
 * AKTUELLEN Verschluss — sonst hinge das Code-Foto an einer beendeten Session und wäre über das
 * Anti-Lockout-Ventil sofort freigegeben).
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/authGuards", () => ({ requireApi: vi.fn() }));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/authGuards";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const CODE_URL = "/api/uploads/code-123.jpg";
const LOCKED = { id: "e1", type: "VERSCHLUSS" };

const req = (body: unknown) =>
  new NextRequest("http://x/api/bildersafe/seal", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENABLE_BILDERSAFE", "true");
  vi.mocked(requireApi).mockResolvedValue({ user: { id: "u1" } } as Awaited<ReturnType<typeof requireApi>>);
  db.entry.findFirst.mockResolvedValue(LOCKED);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/bildersafe/seal — Guard-Kette", () => {
  it("ohne Session: die Antwort des Auth-Guards, kein DB-Zugriff", async () => {
    const unauth = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(requireApi).mockResolvedValue(unauth);
    const res = await POST(req({ codeImageUrl: CODE_URL }));
    expect(res.status).toBe(401);
    expect(db.entry.findFirst).not.toHaveBeenCalled();
  });

  it("Feature-Flag aus → 404, auch mit gültigem Body (Route existiert nach aussen nicht)", async () => {
    vi.stubEnv("ENABLE_BILDERSAFE", "false");
    expect((await POST(req({ codeImageUrl: CODE_URL }))).status).toBe(404);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("fehlende oder externe codeImageUrl → 400 (nur eigene Upload-Pfade)", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ codeImageUrl: "https://evil.example/x.jpg" }))).status).toBe(400);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("nicht verschlossen (kein KG-Eintrag) → 400, nichts geschrieben", async () => {
    db.entry.findFirst.mockResolvedValue(null);
    expect((await POST(req({ codeImageUrl: CODE_URL }))).status).toBe(400);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("nicht verschlossen (jüngster KG-Eintrag ist OEFFNEN) → 400, nichts geschrieben", async () => {
    db.entry.findFirst.mockResolvedValue({ id: "e2", type: "OEFFNEN" });
    expect((await POST(req({ codeImageUrl: CODE_URL }))).status).toBe(400);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("verschlossen → hängt das Code-Foto an den AKTUELLEN Verschluss", async () => {
    const res = await POST(req({ codeImageUrl: CODE_URL, codeReadable: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { codeImageUrl: CODE_URL, codeReadable: true },
    });
  });

  it("ohne codeReadable wird null gespeichert (nicht undefined)", async () => {
    await POST(req({ codeImageUrl: CODE_URL }));
    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { codeImageUrl: CODE_URL, codeReadable: null },
    });
  });
});
