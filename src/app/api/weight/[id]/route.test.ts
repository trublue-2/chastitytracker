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
vi.mock("@/lib/weightService", () => ({ deleteWeightEntry: vi.fn() }));

import { DELETE } from "./route";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { deleteWeightEntry } from "@/lib/weightService";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const call = (id = "w1") =>
  DELETE(new NextRequest(`http://x/api/weight/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.weightEntry.findUnique.mockResolvedValue({ userId: "sub1" });
  vi.mocked(requireKeyholderOrAdminApi).mockResolvedValue(null);
  vi.mocked(deleteWeightEntry).mockResolvedValue({ ok: true, data: null });
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
