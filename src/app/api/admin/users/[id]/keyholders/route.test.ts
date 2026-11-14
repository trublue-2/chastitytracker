import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Keyholder-Zuordnung. Auch ein ADMIN ist zuordenbar: er kontrolliert zwar alle Subs per Rolle, liest
 * aber nur mit Zuordnung, was ein Sub teilt (Tagebuch, `canReadJournal`) — ohne diesen Weg bliebe das
 * Tagebuch einer Instanz mit einziger Admin-Keyholderin für immer unlesbar.
 */
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ canReadJournal: vi.fn(), isKeyholderOf: vi.fn(), getControllableSubsCached: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    adminUserRelationship: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { POST, DELETE } from "./route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SUB = "sub00000000000000000001";
const post = (keyholderId?: string) =>
  POST(
    new NextRequest(`http://x/api/admin/users/${SUB}/keyholders`, { method: "POST", body: JSON.stringify({ keyholderId }) }),
    { params: Promise.resolve({ id: SUB }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "adm", role: "admin" } } as never);
});

describe("POST /api/admin/users/[id]/keyholders", () => {
  it("ordnet einen Admin zu", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "kh-admin", role: "admin" } as never);
    const res = await post("kh-admin");
    expect(res.status).toBe(200);
    expect(prisma.adminUserRelationship.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { adminId: "kh-admin", userId: SUB } }),
    );
  });

  it("lehnt einen Admin ab, solange USE_ADMIN_RELATIONSHIPS den Sichtbereich aus dieser Tabelle liest", async () => {
    vi.stubEnv("USE_ADMIN_RELATIONSHIPS", "true");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "kh-admin", role: "admin" } as never);
    const res = await post("kh-admin");
    vi.unstubAllEnvs();
    expect(res.status).toBe(400);
    expect(prisma.adminUserRelationship.upsert).not.toHaveBeenCalled();
  });

  it("lehnt den Sub selbst ab", async () => {
    const res = await post(SUB);
    expect(res.status).toBe(400);
    expect(prisma.adminUserRelationship.upsert).not.toHaveBeenCalled();
  });

  it("404 bei unbekanntem Konto", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect((await post("nope")).status).toBe(404);
  });

  it("verlangt Admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u", role: "user" } } as never);
    expect((await post("kh")).status).toBeGreaterThanOrEqual(401);
    expect(prisma.adminUserRelationship.upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/users/[id]/keyholders", () => {
  it("entfernt die Zuordnung", async () => {
    const res = await DELETE(
      new NextRequest(`http://x/api/admin/users/${SUB}/keyholders`, { method: "DELETE", body: JSON.stringify({ keyholderId: "kh" }) }),
      { params: Promise.resolve({ id: SUB }) },
    );
    expect(res.status).toBe(200);
    expect(prisma.adminUserRelationship.deleteMany).toHaveBeenCalledWith({ where: { adminId: "kh", userId: SUB } });
  });
});
