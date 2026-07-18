import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Die Auslieferungs-Schranke des versiegelten Code-Fotos. Die Versiegelung ist NUR diese Route:
 * die Datei liegt als normale Upload-Datei auf der Platte, einzig der Sealed-Check hier hält sie
 * vor dem Owner verborgen. Genauso load-bearing ist der Bypass — Admin und Keyholder müssen das
 * Foto IMMER sehen (sonst wäre bei verlorenem Code niemand mehr auskunftsfähig), und der
 * Keyholder-Zugriff muss auf die EIGENEN Subs gescopt bleiben.
 * `isCodePhotoRevealed` selbst ist in `lib/queries.test.ts` abgedeckt — hier ist es gemockt.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ isKeyholderOf: vi.fn() }));
vi.mock("@/lib/queries", () => ({ isCodePhotoRevealed: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: vi.fn() }));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isKeyholderOf } from "@/lib/keyholder";
import { isCodePhotoRevealed } from "@/lib/queries";
import { readFile } from "fs/promises";
import type { PrismaMock } from "@/test/prismaMock";
import type { Session } from "next-auth";

const db = prisma as unknown as PrismaMock;

const OWNER = "u1";
const CODE_PHOTO = { userId: OWNER, startTime: new Date("2026-06-20T08:00:00Z") };

const session = (id: string, role = "user") => ({ user: { id, role } }) as unknown as Session;

// NextAuth v5 überlädt `auth` (Session-Getter UND Middleware-Wrapper); ein blankes
// `vi.mocked(auth)` griffe die Middleware-Overload und liesse `mockResolvedValue` am Typ scheitern.
const authMock = vi.mocked(auth as unknown as () => Promise<Session | null>);

const get = (segments = ["code-123.jpg"]) =>
  GET(new NextRequest(`http://x/api/uploads/${segments.join("/")}`), {
    params: Promise.resolve({ path: segments }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(session(OWNER));
  vi.mocked(isKeyholderOf).mockResolvedValue(false);
  vi.mocked(isCodePhotoRevealed).mockResolvedValue(false);
  vi.mocked(readFile).mockResolvedValue(Buffer.from("jpeg-bytes"));
  // Die Route sucht den Eigentümer über mehrere Quellen; hier ist die Datei ein Code-Foto.
  db.entry.findFirst.mockImplementation(async (args: unknown) => {
    const where = (args as { where: Record<string, unknown> }).where;
    return where.codeImageUrl ? CODE_PHOTO : null;
  });
});

describe("GET /api/uploads/[...path] — Bildersafe-Auslieferung", () => {
  it("ohne Session: 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("Path-Traversal (..): 403, bevor irgendetwas gelesen wird", async () => {
    expect((await get(["..", "secrets.jpg"])).status).toBe(403);
    expect(db.entry.findFirst).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("Fremder (weder Owner noch Admin noch Keyholder): 403, keine Datei", async () => {
    authMock.mockResolvedValue(session("stranger"));
    expect((await get()).status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("Owner + versiegelt: 403 Sealed — die Datei verlässt den Server nicht", async () => {
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Sealed");
    // Nur das erste Argument ist der Vertrag (das Code-Foto); ein später explizit
    // durchgereichtes `now` (Signatur-Default) darf den Test nicht brechen.
    expect(vi.mocked(isCodePhotoRevealed).mock.calls[0]?.[0]).toEqual(CODE_PHOTO);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("Owner + freigegeben: 200, aber no-store — nach erneutem Versiegeln darf kein Cache liefern", async () => {
    vi.mocked(isCodePhotoRevealed).mockResolvedValue(true);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("Admin sieht das Code-Foto IMMER — ohne Reveal-Check (Bypass)", async () => {
    authMock.mockResolvedValue(session("admin1", "admin"));
    expect((await get()).status).toBe(200);
    expect(isCodePhotoRevealed).not.toHaveBeenCalled();
  });

  it("Keyholder des Owners sieht das Code-Foto IMMER — ohne Reveal-Check (Bypass)", async () => {
    authMock.mockResolvedValue(session("kh1"));
    vi.mocked(isKeyholderOf).mockResolvedValue(true);
    expect((await get()).status).toBe(200);
    // Der Bypass ist strikt auf die konkrete Beziehung gescopt: Aktor → Eigentümer.
    expect(isKeyholderOf).toHaveBeenCalledWith("kh1", OWNER);
    expect(isCodePhotoRevealed).not.toHaveBeenCalled();
  });

  it("normales Entry-Foto (kein Code-Foto): kein Reveal-Check, Langzeit-Cache bleibt", async () => {
    db.entry.findFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where: Record<string, unknown> }).where;
      return where.imageUrl ? { userId: OWNER } : null;
    });
    const res = await get(["photo.jpg"]);
    expect(res.status).toBe(200);
    expect(isCodePhotoRevealed).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
  });
});
