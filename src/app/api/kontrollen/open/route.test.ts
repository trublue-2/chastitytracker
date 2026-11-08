// Die Antwort-Schlüssel sind Vertrag zu Geräten ausserhalb dieses Repos — eine Umbenennung bricht
// sie, ohne dass hier etwas rot wird. Deshalb pinnt der Test die Form.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/shared/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }));

import { GET } from "./route";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/shared/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
  db.kontrollAnforderung.findMany.mockResolvedValue([]);
});

describe("GET /api/kontrollen/open", () => {
  it("ohne Session: 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(db.kontrollAnforderung.findMany).not.toHaveBeenCalled();
  });

  it("keine offene Kontrolle: leere Liste", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inspections: [] });
  });

  it("liefert Code und Frist in schmaler, fester Form", async () => {
    db.kontrollAnforderung.findMany.mockResolvedValue([
      {
        id: "k1", code: "48213", deadline: new Date("2026-10-14T18:30:00.000Z"),
        categoryId: null, deviceId: "d1", kommentar: "darf nicht in die Antwort",
        category: null, device: { name: "x" },
      },
      { id: "k2", code: null, deadline: new Date("2026-10-15T08:00:00.000Z"), categoryId: "c1", deviceId: null },
    ]);
    const body = await (await GET()).json();
    expect(body).toEqual({
      inspections: [
        { id: "k1", code: "48213", deadline: "2026-10-14T18:30:00.000Z", categoryId: null, deviceId: "d1" },
        { id: "k2", code: null, deadline: "2026-10-15T08:00:00.000Z", categoryId: "c1", deviceId: null },
      ],
    });
  });
});
