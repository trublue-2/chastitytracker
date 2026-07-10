import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Der Vertrag Tracker → Heimdall. Feldbestand und Bedeutung sind eine Schnittstelle zu Code, der
 * NICHT in diesem Repo liegt — ein stilles Umbenennen bricht die Box, ohne dass hier etwas rot wird.
 *
 * Der Vertrag trägt NUR die Sperrzeit. Die Reinigungs-Regeln bleiben im Tracker: er entscheidet, ob
 * eine Öffnung erlaubt ist, und schickt daraufhin ein `open`. Ein früherer Anlauf lieferte sie hier
 * mit — Heimdall las das Feld nie, und zwei Regelwerke über dieselbe Frage laufen auseinander.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const SECRET = "test-secret";

const req = (url = "http://x/api/integration/box/config?username=sub", auth = `Bearer ${SECRET}`) =>
  new NextRequest(url, { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HEIMDALL_SYNC_SECRET = SECRET;
  db.user.findUnique.mockResolvedValue({ id: "u1" });
  db.verschlussAnforderung.findFirst.mockResolvedValue(null); // getActiveSperrzeit
});

describe("GET /api/integration/box/config — Vertrag zur Box", () => {
  it("ohne gültiges Secret: 401, ohne jede Nutzlast", async () => {
    const res = await GET(req("http://x/api/integration/box/config?username=sub", ""));
    expect(res.status).toBe(401);
  });

  it("ohne username: 400", async () => {
    const res = await GET(req("http://x/api/integration/box/config"));
    expect(res.status).toBe(400);
  });

  it("unbekannter User: 404", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it("ohne aktive Sperrzeit bleibt `sperrzeit` null — das P1-Verhalten ist unverändert", async () => {
    const body = await (await GET(req())).json();
    expect(body.sperrzeit).toBeNull();
  });

  it("eine befristete Sperrzeit kommt als ISO-Zeitpunkt, indefinite=false", async () => {
    db.verschlussAnforderung.findFirst.mockResolvedValue({ endetAt: new Date("2026-07-10T17:19:48+02:00"), reinigungErlaubt: true });
    const body = await (await GET(req())).json();
    expect(body.sperrzeit).toEqual({ endetAt: "2026-07-10T15:19:48.000Z", indefinite: false, reinigungErlaubt: true });
  });

  it("eine unbefristete Sperrzeit trägt indefinite=true und endetAt=null", async () => {
    db.verschlussAnforderung.findFirst.mockResolvedValue({ endetAt: null, reinigungErlaubt: false });
    const body = await (await GET(req())).json();
    expect(body.sperrzeit).toEqual({ endetAt: null, indefinite: true, reinigungErlaubt: false });
  });

  it("die Reinigungs-Regeln verlassen den Tracker NICHT — die Box kennt keinen Reinigungs-Begriff", async () => {
    const body = await (await GET(req())).json();
    expect(body).not.toHaveProperty("reinigung");
    expect(Object.keys(body)).toEqual(["sperrzeit"]);
  });
});
