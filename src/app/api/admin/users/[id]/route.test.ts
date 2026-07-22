import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Der Last-Admin-Guard des Rollen-Wechsels (Begründung siehe route.ts). Vorfall 22.07.2026: eine
 * Instanz setzte beide Admins auf `user` und war danach nur noch per DB-Zugriff zu entsperren.
 *
 * Der Prisma-Mock aus `@/test/prismaMock` deckt bewusst nur Modell-Lesepfade ab und wirft bei
 * `$transaction`; hier wird deshalb von Hand gemockt. Die Transaktion läuft direkt gegen denselben
 * Client — das genügt, weil der Test die Guard-Entscheidung prüft, nicht die Isolation.
 */
const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
// Beide Guards müssen im Mock stehen — die Route importiert sie, auch wenn der Rollen-Zweig
// ausschliesslich über `requireAdminApi` läuft.
vi.mock("@/lib/authGuards", () => ({
  requireAdminApi: vi.fn(async () => null),
  requireKeyholderOrAdminApi: vi.fn(async () => null),
}));

import { PATCH } from "./route";

const TARGET_ID = "target-user-id";
const OTHER_ADMIN_ID = "other-admin-id";

function patchRole(role: string) {
  return PATCH(
    new NextRequest(`http://localhost/api/admin/users/${TARGET_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }),
    { params: Promise.resolve({ id: TARGET_ID }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.user.update.mockResolvedValue({ id: TARGET_ID, role: "user" });
});

describe("PATCH /api/admin/users/[id] — Rollenwechsel", () => {
  it("lehnt die Degradierung des letzten Admins ab", async () => {
    db.user.findMany.mockResolvedValue([{ id: TARGET_ID }]);

    const res = await patchRole("user");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "lastAdmin" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("erlaubt die Degradierung, solange ein zweiter Admin bleibt", async () => {
    db.user.findMany.mockResolvedValue([{ id: TARGET_ID }, { id: OTHER_ADMIN_ID }]);

    const res = await patchRole("user");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TARGET_ID, role: "user" });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: TARGET_ID }, data: { role: "user" } });
  });

  it("lässt einen Nicht-Admin durch, auch wenn er der einzige verbleibende Admin WÄRE", async () => {
    // Ein einzelner Admin, der nicht das Ziel ist: das Ziel ist bereits `user`, der Guard greift nicht.
    db.user.findMany.mockResolvedValue([{ id: OTHER_ADMIN_ID }]);

    const res = await patchRole("user");

    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalled();
  });

  it("prüft nur beim Degradieren — eine Beförderung liest die Admin-Liste gar nicht", async () => {
    db.user.update.mockResolvedValue({ id: TARGET_ID, role: "admin" });

    const res = await patchRole("admin");

    expect(res.status).toBe(200);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("weist eine unbekannte Rolle ab, ohne die DB anzufassen", async () => {
    const res = await patchRole("superadmin");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalidRole" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
