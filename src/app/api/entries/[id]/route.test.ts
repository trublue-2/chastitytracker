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
  entry: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  device: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

const access = vi.hoisted(() => ({ entryManageAccess: vi.fn() }));
const ids = vi.hoisted(() => ({ OWNER_ID: "owner-id", ENTRY_ID: "entry-id" }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/authGuards", () => ({
  requireApi: vi.fn(async () => ({ user: { id: ids.OWNER_ID, role: "user" } })),
}));
vi.mock("@/lib/auth/keyholder", () => access);
vi.mock("@/lib/imageUtils", () => ({
  deleteUploadedFiles: vi.fn(),
  entryImageUrls: vi.fn(() => []),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const correction = vi.hoisted(() => ({ deleteEntryForUser: vi.fn() }));
vi.mock("@/lib/entryCorrection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entryCorrection")>()),
  deleteEntryForUser: correction.deleteEntryForUser,
}));

import { DELETE, PATCH } from "./route";

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

/**
 * Wer einen Eintrag löschen darf (Issue #111). Der Träger nur einen Verschluss-AUFRUF, der noch auf
 * den Riegel wartet — sonst könnte er eine Öffnung erfassen, den Bildersafe-Code ablesen und die
 * Öffnung spurlos wieder löschen. Alles andere löscht die Keyholderin oder ein Admin.
 */
describe("DELETE /api/entries/[id] — nur die Keyholderin löscht", () => {
  const del = () =>
    DELETE(new NextRequest(`http://localhost/api/entries/${ENTRY_ID}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: ENTRY_ID }),
    });
  const opening = { id: ENTRY_ID, userId: OWNER_ID, type: "OEFFNEN", startTime: new Date("2026-07-20T10:00:00Z"), boltConfirmedAt: null };

  beforeEach(() => {
    correction.deleteEntryForUser.mockResolvedValue({ ok: true });
  });

  it("Träger löscht seine eigene Öffnung → 403 DELETE_KEYHOLDER_ONLY, nichts gelöscht", async () => {
    db.entry.findUnique.mockResolvedValue(opening);
    const res = await del();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "DELETE_KEYHOLDER_ONLY" });
    expect(correction.deleteEntryForUser).not.toHaveBeenCalled();
  });

  it("Träger nimmt einen schwebenden Verschluss-Aufruf zurück → erlaubt", async () => {
    db.entry.findUnique.mockResolvedValue({ ...opening, type: "VERSCHLUSS", boltConfirmedAt: null });
    expect((await del()).status).toBe(204);
    expect(correction.deleteEntryForUser).toHaveBeenCalled();
  });

  it("Keyholderin (erhaben) löscht die Öffnung ihres Trägers → erlaubt", async () => {
    access.entryManageAccess.mockResolvedValue({ allowed: true, elevated: true });
    db.entry.findUnique.mockResolvedValue({ ...opening, type: "PRUEFUNG" });
    expect((await del()).status).toBe(204);
  });
});

/**
 * Ketten-Bruch beim Löschen: ein schwebender Verschluss-AUFRUF steht nicht in der Kette. Die Route
 * las die Nachbarn früher mit eigener Abfrage OHNE `effectiveEntryWhere` und hielt ihn für einen —
 * sie meldete einen Bruch, der keiner ist. Jetzt entscheidet `chainBreakPartner`.
 */
describe("DELETE /api/entries/[id] — Ketten-Bruch", () => {
  type Row = Record<string, unknown>;
  /** Wertet den kleinen Ausschnitt von Prisma-`where` aus, den die Nachbar-Abfragen benutzen. */
  function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === "AND") return (cond as Row[]).every((c) => matches(row, c));
      if (key === "OR") return (cond as Row[]).some((c) => matches(row, c));
      if (key === "NOT") return !matches(row, cond as Row);
      const v = row[key];
      if (cond === null || typeof cond !== "object" || cond instanceof Date) return v === cond;
      const c = cond as Record<string, unknown>;
      return Object.entries(c).every(([op, arg]) => {
        const cmp = (a: unknown, b: unknown) => (a as Date).valueOf?.() ?? a;
        switch (op) {
          case "in": return (arg as unknown[]).includes(v);
          case "not": return arg === null ? v !== null : v !== arg;
          case "lt": return (cmp(v, 0) as number) < (cmp(arg, 0) as number);
          case "lte": return (cmp(v, 0) as number) <= (cmp(arg, 0) as number);
          case "gt": return (cmp(v, 0) as number) > (cmp(arg, 0) as number);
          default: return true;
        }
      });
    });
  }
  const at = (h: number) => new Date(Date.UTC(2026, 6, 20, h));
  const row = (id: string, type: string, h: number, extra: Row = {}): Row => ({
    id, userId: OWNER_ID, type, startTime: at(h), boltConfirmedAt: type === "VERSCHLUSS" ? at(h) : null,
    openAwaitsBolt: false, deviceId: null, imageUrl: null, codeImageUrl: null, boxImageUrl: null, ...extra,
  });
  const del = (query = "") =>
    DELETE(new NextRequest(`http://localhost/api/entries/${ENTRY_ID}${query}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: ENTRY_ID }),
    });

  function seed(rows: Row[]) {
    db.entry.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null);
    db.entry.findFirst.mockImplementation(async ({ where, orderBy }: { where: Row; orderBy: { startTime: "asc" | "desc" } }) => {
      const hits = rows.filter((r) => matches(r, where)).sort((a, b) => (a.startTime as Date).getTime() - (b.startTime as Date).getTime());
      return (orderBy.startTime === "asc" ? hits[0] : hits[hits.length - 1]) ?? null;
    });
  }

  beforeEach(() => {
    access.entryManageAccess.mockResolvedValue({ allowed: true, elevated: true });
    correction.deleteEntryForUser.mockResolvedValue({ ok: true });
  });

  it("Öffnung vor einem schwebenden Verschluss-Aufruf: kein Ketten-Bruch → wird gelöscht", async () => {
    seed([
      row("v1", "VERSCHLUSS", 8),
      row(ENTRY_ID, "OEFFNEN", 10),
      row("pending", "VERSCHLUSS", 12, { boltConfirmedAt: null }),
    ]);
    const res = await del();
    expect(res.status).toBe(204);
    expect(correction.deleteEntryForUser).toHaveBeenCalledWith(expect.objectContaining({ id: ENTRY_ID }), null);
  });

  it("echter Ketten-Bruch (Öffnung zwischen zwei bestätigten Verschlüssen) meldet chainBreak samt Partner", async () => {
    seed([row("v1", "VERSCHLUSS", 8), row(ENTRY_ID, "OEFFNEN", 10), row("v2", "VERSCHLUSS", 12)]);
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      chainBreak: true,
      partner: { id: "v1", type: "VERSCHLUSS", startTime: at(8).toISOString() },
    });
    expect(correction.deleteEntryForUser).not.toHaveBeenCalled();
  });

  it("withPartner löscht Eintrag und Partner gemeinsam; falsche partnerId → 409 PARTNER_CHANGED", async () => {
    seed([row("v1", "VERSCHLUSS", 8), row(ENTRY_ID, "OEFFNEN", 10), row("v2", "VERSCHLUSS", 12)]);
    expect((await del("?withPartner=true&partnerId=other")).status).toBe(409);
    expect((await del("?withPartner=true&partnerId=v1")).status).toBe(204);
    expect(correction.deleteEntryForUser).toHaveBeenCalledWith(expect.objectContaining({ id: ENTRY_ID }), "v1");
  });
});
