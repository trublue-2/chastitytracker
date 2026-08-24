import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Die Rechte-Grenze des Löschens. Sie hängt am BESITZER der Zeile, nicht am Aufrufer — ein Guard
 * gegen den Aufrufer liesse jeden Keyholder die Messungen jedes fremden Trägers löschen, weil er
 * für IRGENDEINEN Träger berechtigt ist.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/authGuards", () => ({ requireKeyholderOrAdminApi: vi.fn() }));
vi.mock("@/lib/weightService", () => ({ deleteWeightEntry: vi.fn(), updateWeightEntry: vi.fn() }));

import { DELETE, PATCH } from "./route";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { deleteWeightEntry, updateWeightEntry } from "@/lib/weightService";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const call = (id = "w1") =>
  DELETE(new NextRequest(`http://x/api/weight/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

const patch = (body: unknown, id = "w1") =>
  PATCH(
    new NextRequest(`http://x/api/weight/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  db.weightEntry.findUnique.mockResolvedValue({ userId: "sub1" });
  vi.mocked(requireKeyholderOrAdminApi).mockResolvedValue(null);
  vi.mocked(deleteWeightEntry).mockResolvedValue({ ok: true, data: null });
  vi.mocked(updateWeightEntry).mockResolvedValue({ ok: true, data: null });
});

describe("DELETE /api/weight/[id]", () => {
  it("prüft die Berechtigung gegen den BESITZER der Zeile", async () => {
    await call();
    expect(requireKeyholderOrAdminApi).toHaveBeenCalledWith("sub1");
  });

  it("löscht, wenn der Guard durchlässt", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(deleteWeightEntry).toHaveBeenCalledWith("w1");
  });

  it("löscht NICHT, wenn der Guard ablehnt", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireKeyholderOrAdminApi).mockResolvedValue(
      NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    );
    const res = await call();
    expect(res.status).toBe(403);
    expect(deleteWeightEntry).not.toHaveBeenCalled();
  });

  it("eine unbekannte id ist 404 — und wird gar nicht erst geprüft", async () => {
    db.weightEntry.findUnique.mockResolvedValue(null);
    const res = await call("gibtsnicht");
    expect(res.status).toBe(404);
    // Kein Guard-Aufruf: die Antwort darf nicht verraten, welche ids existieren.
    expect(requireKeyholderOrAdminApi).not.toHaveBeenCalled();
    expect(deleteWeightEntry).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/weight/[id]", () => {
  it("korrigiert Wert und Notiz", async () => {
    const res = await patch({ weightKg: 74.2, note: "korrigiert" });
    expect(res.status).toBe(200);
    expect(updateWeightEntry).toHaveBeenCalledWith("w1", { weightKg: 74.2, note: "korrigiert" });
  });

  it("gibt ein fehlendes Feld als `undefined` weiter — Patch-Semantik, kein Nullen", async () => {
    // Ohne diese Unterscheidung löschte eine reine Wert-Korrektur die Notiz mit.
    await patch({ weightKg: 74.2 });
    expect(updateWeightEntry).toHaveBeenCalledWith("w1", { weightKg: 74.2, note: undefined });
  });

  it("prüft dieselbe Rechte-Grenze wie das Löschen", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireKeyholderOrAdminApi).mockResolvedValue(
      NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    );
    const res = await patch({ weightKg: 74.2 });
    expect(res.status).toBe(403);
    expect(updateWeightEntry).not.toHaveBeenCalled();
  });

  it("eine unbekannte id ist 404, bevor der Guard läuft", async () => {
    db.weightEntry.findUnique.mockResolvedValue(null);
    const res = await patch({ weightKg: 74.2 }, "gibtsnicht");
    expect(res.status).toBe(404);
    expect(requireKeyholderOrAdminApi).not.toHaveBeenCalled();
  });
});
