import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Der Vertrag Tracker → Heimdall. Feldbestand und Bedeutung sind eine Schnittstelle zu Code, der
 * NICHT in diesem Repo liegt — ein stilles Umbenennen bricht die Box, ohne dass hier etwas rot wird.
 *
 * Anlass: die Reinigungs-Fenster verliessen den Tracker jahrelang nicht. Sie mussten auf der Box ein
 * zweites Mal gepflegt werden, und eine Änderung im Admin-UI blieb wirkungslos — bemerkt hat es
 * niemand, weil nichts fehlschlug.
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

const USER = {
  id: "u1",
  timezone: "Europe/Zurich",
  reinigungErlaubt: true,
  reinigungMaxMinuten: 15,
  reinigungMaxProTag: 2,
  reinigungsFenster: [{ start: "05:30", end: "07:00" }, { start: "17:30", end: "18:00" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HEIMDALL_SYNC_SECRET = SECRET;
  db.user.findUnique.mockResolvedValue(USER);
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

  it("liefert die Reinigungs-Fenster an die Box — der Kern dieser Erweiterung", async () => {
    const body = await (await GET(req())).json();
    expect(body.reinigung).toEqual({
      erlaubt: true,
      maxMinutenProPause: 15,
      maxProTag: 2,
      fenster: [{ start: "05:30", end: "07:00" }, { start: "17:30", end: "18:00" }],
      // Ohne Zeitzone legte die Box die Wanduhrzeiten in ihrer eigenen Zone aus.
      timezone: "Europe/Zurich",
    });
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

  it("ungültige und über Mitternacht laufende Fenster erreichen die Box nicht", async () => {
    db.user.findUnique.mockResolvedValue({
      ...USER,
      reinigungsFenster: [{ start: "22:00", end: "02:00" }, { start: "quatsch", end: "07:00" }, { start: "09:00", end: "09:30" }],
    });
    const body = await (await GET(req())).json();
    expect(body.reinigung.fenster).toEqual([{ start: "09:00", end: "09:30" }]);
  });

  it("Defaults, wenn der User nichts konfiguriert hat", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", timezone: null, reinigungErlaubt: null, reinigungMaxMinuten: null, reinigungMaxProTag: null, reinigungsFenster: null });
    const body = await (await GET(req())).json();
    expect(body.reinigung).toEqual({
      erlaubt: false, maxMinutenProPause: 15, maxProTag: 0, fenster: [], timezone: "Europe/Zurich",
    });
  });
});
