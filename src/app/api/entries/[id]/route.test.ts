import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Nachweis-Erhalt beim Bearbeiten einer Kontrolle (Begründung siehe route.ts).
 *
 * Beim Anlegen verlangt `validateEntryPayload` für jede PRUEFUNG ein Foto. Ohne den Guard in der
 * PATCH-Route liesse sich der fotolose Zustand aber in zwei Schritten herstellen — erfassen, dann
 * das Foto wieder entfernen —, während die KontrollAnforderung erfüllt bleibt.
 *
 * Gemockt wird nur, was der Guard-Pfad berührt; er greift vor der Transaktion, daher genügt ein
 * `entry.findUnique` plus ein `$transaction`, das direkt gegen denselben Client läuft.
 */
const db = vi.hoisted(() => ({
  entry: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

const access = vi.hoisted(() => ({ entryManageAccess: vi.fn() }));
const ids = vi.hoisted(() => ({ OWNER_ID: "owner-id", ENTRY_ID: "entry-id" }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/authGuards", () => ({
  requireApi: vi.fn(async () => ({ user: { id: ids.OWNER_ID, role: "user" } })),
}));
vi.mock("@/lib/keyholder", () => access);
vi.mock("@/lib/imageUtils", () => ({
  deleteUploadedFiles: vi.fn(),
  entryImageUrls: vi.fn(() => []),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { PATCH } from "./route";

const { OWNER_ID, ENTRY_ID } = ids;
const PHOTO = "/api/uploads/kontrolle.jpg";

/** Eine erfüllte, angeforderte Kontrolle: PRUEFUNG mit Code UND Foto. */
function inspectionEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: OWNER_ID,
    type: "PRUEFUNG",
    startTime: new Date("2026-07-20T10:00:00Z"),
    imageUrl: PHOTO,
    kontrollCode: "12345",
    oeffnenGrund: null,
    orgasmusArt: null,
    deviceId: null,
    ...overrides,
  };
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(`http://localhost/api/entries/${ENTRY_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ENTRY_ID }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.entry.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...inspectionEntry(),
    ...data,
  }));
  // Der Sub bearbeitet seinen eigenen Eintrag: erlaubt, aber nicht erhaben.
  access.entryManageAccess.mockResolvedValue({ allowed: true, elevated: false });
});

describe("PATCH /api/entries/[id] — Foto-Pflicht einer angeforderten Kontrolle", () => {
  it("weist es ab, wenn der Sub das Foto einer Kontrolle entfernt", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry());

    const res = await patch({ imageUrl: null });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INSPECTION_PHOTO_REQUIRED" });
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("weist auch den leeren String ab (kein Foto ist kein Foto)", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry());

    const res = await patch({ imageUrl: "" });

    expect(res.status).toBe(400);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("weist es ab, wenn einem fotolosen Eintrag nachträglich ein Kontroll-Code angehängt wird", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry({ imageUrl: null, kontrollCode: null }));

    const res = await patch({ kontrollCode: "12345" });

    expect(res.status).toBe(400);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("weist es ab, wenn Code UND Foto in einem Zug entfernt werden", async () => {
    // Die KontrollAnforderung hängt am entryId, nicht am Code — sie bliebe sonst erfüllt.
    db.entry.findUnique.mockResolvedValue(inspectionEntry());

    const res = await patch({ kontrollCode: null, imageUrl: null });

    expect(res.status).toBe(400);
    expect(db.entry.update).not.toHaveBeenCalled();
  });

  it("lässt jedes beliebige Foto durch — über den Inhalt urteilt die Keyholderin", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry());

    const res = await patch({ imageUrl: "/api/uploads/irgendwas-anderes.jpg" });

    expect(res.status).toBe(200);
    expect(db.entry.update).toHaveBeenCalled();
  });

  it("lässt eine Änderung ohne Foto-Bezug durch (Notiz an einer Kontrolle)", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry());

    const res = await patch({ note: "nachgetragen" });

    expect(res.status).toBe(200);
    expect(db.entry.update).toHaveBeenCalled();
  });

  it("lässt die FREIWILLIGE Kontrolle ohne Code unberührt — die hat niemand angefordert", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry({ kontrollCode: null }));

    const res = await patch({ imageUrl: null });

    expect(res.status).toBe(200);
    expect(db.entry.update).toHaveBeenCalled();
  });

  it("lässt andere Eintrags-Typen unberührt", async () => {
    db.entry.findUnique.mockResolvedValue(
      inspectionEntry({ type: "ORGASMUS", kontrollCode: null, imageUrl: PHOTO })
    );

    const res = await patch({ imageUrl: null });

    expect(res.status).toBe(200);
    expect(db.entry.update).toHaveBeenCalled();
  });

  it("lässt die Keyholderin das Foto entfernen — sie beurteilt den Nachweis, sie darf ihn auch verwerfen", async () => {
    db.entry.findUnique.mockResolvedValue(inspectionEntry());
    access.entryManageAccess.mockResolvedValue({ allowed: true, elevated: true });

    const res = await patch({ imageUrl: null });

    expect(res.status).toBe(200);
    expect(db.entry.update).toHaveBeenCalled();
  });
});
