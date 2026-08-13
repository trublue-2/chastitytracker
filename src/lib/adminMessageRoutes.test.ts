import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Die Rechte-Grenze des Keyholder-Posteingangs — auf ROUTEN-Ebene geprüft, nicht nur im Service.
 *
 * `messageService.test.ts` pinnt bereits, dass der Service mit einer fremden Id nichts trifft. Was
 * dort NICHT geprüft werden kann, ist die Frage davor: woher die Sub-Liste kommt. Nimmt eine Route
 * sie je aus Query oder Body, ist der Service tadellos und das Feature trotzdem offen — und ein
 * Plain-Sub, der eine leere Liste statt eines 403 bekommt, sieht heute nichts und morgen alles,
 * sobald ihm jemand einen Träger zuordnet.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
// Der Presenter löst Texte auf; die Sprache ist für diese Prüfungen ohne Belang.
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "de"),
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, { has: () => true })),
}));

import { GET } from "@/app/api/admin/messages/route";
import { DELETE as deleteMessageRoute } from "@/app/api/admin/messages/[id]/route";
import { POST as markReadRoute, DELETE as markUnreadRoute } from "@/app/api/admin/messages/[id]/read/route";
import { POST as readAllRoute } from "@/app/api/admin/messages/read-all/route";
import { POST as bulkRoute } from "@/app/api/admin/messages/bulk/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;
const authMock = mock(auth);

/** Anfrage-Doppelgänger: die Routen lesen nur `nextUrl` bzw. `json()`. */
const getReq = (query = "") => ({ nextUrl: new URL(`http://x/api/admin/messages${query}`) }) as unknown as NextRequest;
const jsonReq = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const idParams = (id: string) => Promise.resolve({ id });

/** Wer ruft: ein Keyholder mit genau einem zugewiesenen Träger. */
function signInAsKeyholder(subIds: string[] = ["sub1"]) {
  authMock.mockResolvedValue({ user: { id: "kh1", role: "user" } });
  mock(prisma.adminUserRelationship.findMany).mockResolvedValue(
    subIds.map((id) => ({ user: { id, username: id } })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.message.count).mockResolvedValue(0);
  mock(prisma.message.findMany).mockResolvedValue([]);
  mock(prisma.message.findFirst).mockResolvedValue(null);
  mock(prisma.message.deleteMany).mockResolvedValue({ count: 0 });
  mock(prisma.messageRead.deleteMany).mockResolvedValue({ count: 0 });
  mock(prisma.adminUserRelationship.findMany).mockResolvedValue([]);
  mock(prisma.user.findMany).mockResolvedValue([]);
});

/** Jede Route einmal — mit dem Aufruf, den sie im Betrieb bekommt. */
const ROUTES: [name: string, call: () => Promise<Response>][] = [
  ["GET /api/admin/messages", () => GET(getReq())],
  ["DELETE /api/admin/messages/[id]", () => deleteMessageRoute(getReq(), { params: idParams("m1") })],
  ["POST /api/admin/messages/[id]/read", () => markReadRoute(getReq(), { params: idParams("m1") })],
  ["DELETE /api/admin/messages/[id]/read", () => markUnreadRoute(getReq(), { params: idParams("m1") })],
  ["POST /api/admin/messages/read-all", () => readAllRoute()],
  ["POST /api/admin/messages/bulk", () => bulkRoute(jsonReq({ ids: ["m1"], action: "read" }))],
];

describe("Keyholder-Posteingang: wer überhaupt hineinschauen darf", () => {
  it.each(ROUTES)("%s weist einen Sub ohne eigene Träger mit 403 ab — nicht mit einer leeren Liste", async (_name, call) => {
    authMock.mockResolvedValue({ user: { id: "sub9", role: "user" } });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "FORBIDDEN" });
  });

  it.each(ROUTES)("%s weist ohne Session mit 401 ab", async (_name, call) => {
    authMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("der globale Admin einer Ein-Personen-Instanz bekommt eine leere Liste statt eines Fehlers", async () => {
    authMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ messages: [], page: 1, pageCount: 1 });
  });

  it("die Sub-Liste kommt aus der Zuordnung, NIE aus der Anfrage", async () => {
    signInAsKeyholder(["sub1"]);
    // Eine untergeschobene `userId` darf den Scope nicht verschieben.
    await GET(getReq("?userId=sub2&subjectUserId=sub2"));
    expect(mock(prisma.message.count).mock.calls[0][0].where).toMatchObject({
      subjectUserId: { in: ["sub1"] },
      audience: "keyholders",
    });
  });
});

describe("Keyholder-Posteingang: eine fremde Nachrichten-Id trifft nichts", () => {
  it("als gelesen markieren scheitert mit 404 und schreibt kein Lese-Kennzeichen", async () => {
    signInAsKeyholder();
    const res = await markReadRoute(getReq(), { params: idParams("m-von-sub2") });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    // Die Suche ist auf die eigenen Träger eingegrenzt — nicht die Anzeige.
    expect(mock(prisma.message.findFirst).mock.calls[0][0].where).toMatchObject({
      id: "m-von-sub2",
      subjectUserId: { in: ["sub1"] },
      audience: "keyholders",
    });
    expect(mock(prisma.messageRead.upsert)).not.toHaveBeenCalled();
  });

  it("wieder auf ungelesen setzen scheitert ebenso", async () => {
    signInAsKeyholder();
    const res = await markUnreadRoute(getReq(), { params: idParams("m-von-sub2") });
    expect(res.status).toBe(404);
    expect(mock(prisma.messageRead.deleteMany)).not.toHaveBeenCalled();
  });

  it("löschen scheitert mit 404, statt die Zeile eines fremden Trägers zu entfernen", async () => {
    signInAsKeyholder();
    const res = await deleteMessageRoute(getReq(), { params: idParams("m-von-sub2") });
    expect(res.status).toBe(404);
    expect(mock(prisma.message.deleteMany).mock.calls[0][0].where).toMatchObject({
      id: { in: ["m-von-sub2"] },
      subjectUserId: { in: ["sub1"] },
      audience: "keyholders",
    });
  });

  it("im Mengen-Vorgang fällt sie heraus, ohne den Aufruf zu kippen", async () => {
    signInAsKeyholder();
    const res = await bulkRoute(jsonReq({ ids: ["m-von-sub2"], action: "delete" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, affected: 0 });
    expect(mock(prisma.message.deleteMany).mock.calls[0][0].where).toMatchObject({
      subjectUserId: { in: ["sub1"] },
      audience: "keyholders",
    });
  });

  it("auch als gelesen markieren im Mengen-Vorgang trifft keine fremde Zeile", async () => {
    signInAsKeyholder();
    const res = await bulkRoute(jsonReq({ ids: ["m-von-sub2"], action: "read" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ affected: 0 });
    // `scopedMessageIds` grenzt vorher ein — ohne Treffer wird gar nichts geschrieben.
    expect(mock(prisma.messageRead.upsert)).not.toHaveBeenCalled();
  });

  it("ein Keyholder mit mehreren Trägern sucht in genau diesen — und in keinem weiteren", async () => {
    signInAsKeyholder(["sub1", "sub2"]);
    await deleteMessageRoute(getReq(), { params: idParams("m-von-sub3") });
    expect(mock(prisma.message.deleteMany).mock.calls[0][0].where).toMatchObject({
      subjectUserId: { in: ["sub1", "sub2"] },
    });
  });
});

describe("Keyholder-Posteingang: Body-Prüfung des Mengen-Vorgangs", () => {
  it("weist eine unbekannte Aktion ab", async () => {
    signInAsKeyholder();
    const res = await bulkRoute(jsonReq({ ids: ["m1"], action: "purge" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "MESSAGE_ACTION_INVALID" });
  });

  it("ein kaputter Body ist ein 400, kein 500", async () => {
    // `req.json()` wirft bei ungültigem JSON. Ungefangen wäre das ein Server-Fehler auf eine reine
    // Eingabe-Frage — und dieselbe Route bedient beide Posteingänge, der Fehler lag also doppelt.
    signInAsKeyholder();
    const brokenReq = { json: async () => { throw new SyntaxError("Unexpected token"); } } as unknown as NextRequest;
    const res = await bulkRoute(brokenReq);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "MESSAGE_IDS_REQUIRED" });
  });

  it("weist eine leere oder übergrosse Id-Liste ab", async () => {
    signInAsKeyholder();
    expect((await bulkRoute(jsonReq({ ids: [], action: "read" }))).status).toBe(400);
    const tooMany = Array.from({ length: 21 }, (_, i) => `m${i}`);
    expect((await bulkRoute(jsonReq({ ids: tooMany, action: "read" }))).status).toBe(400);
  });
});
