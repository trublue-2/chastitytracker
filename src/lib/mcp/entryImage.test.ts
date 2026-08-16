import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/imageUtils", () => ({
  loadUploadedImage: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { loadMcpImage, mcpImageKeyUnlocked, mcpImageToolVisible } from "./entryImage";
import { loadUploadedImage } from "@/lib/imageUtils";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";
import { taskProofRow } from "@/test/taskProofRow";

const db = prisma as unknown as PrismaMock;
const load = loadUploadedImage as unknown as ReturnType<typeof vi.fn>;
const rateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;

/** Frisch genug, um in Reichweite zu liegen — die 24h zählen ab `createdAt`. */
const fresh = () => new Date(Date.now() - 60 * 60_000);

const entry = (over: Record<string, unknown> = {}) => ({
  type: "PRUEFUNG",
  startTime: new Date("2026-08-01T18:59:00Z"),
  createdAt: fresh(),
  imageUrl: "/api/uploads/a.jpg",
  boxImageUrl: null,
  imageExifTime: new Date("2026-08-01T18:57:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // `deliver()` prüft den Sub-Schlüssel bei jeder Auslieferung mit — sonst käme kein Bild durch.
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("MCP_USERNAME", "sub");
  vi.stubEnv("MCP_IMAGE_KEY", "u1");
  db.user.findUnique.mockResolvedValue({ id: "u1", username: "sub", timezone: "Europe/Zurich" });
  load.mockResolvedValue({ base64: "AAAA", mediaType: "image/jpeg" });
  rateLimit.mockResolvedValue({ limited: false });
});

describe("loadMcpImage — Adressierung", () => {
  it("liefert das Haupt-Foto samt Bildunterschrift", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    const img = await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    expect(img.base64).toBe("AAAA");
    expect(img.mediaType).toBe("image/jpeg");
    expect(img.caption).toContain("PRUEFUNG");
  });

  it("liefert das Box-Foto, wenn danach gefragt wird", async () => {
    db.entry.findFirst.mockResolvedValue(entry({ boxImageUrl: "/api/uploads/box.jpg" }));
    const img = await loadMcpImage("sub", { source: "box", entryId: "e1" });

    expect(load).toHaveBeenCalledWith("/api/uploads/box.jpg", expect.anything());
    expect(img.caption).toContain("Key-box");
  });

  it("holt den Nachweis über taskId + 1-basierten Index — dieselbe Adresse wie review_task_proof", async () => {
    db.task.findFirst.mockResolvedValue(taskProofRow([
      { description: "Vorher", imageUrl: "/api/uploads/v.jpg", imageExifTime: null, submittedAt: fresh() },
      { description: "Nachher", imageUrl: "/api/uploads/n.jpg", imageExifTime: null, submittedAt: fresh() },
    ]));
    const img = await loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 2 });

    expect(load).toHaveBeenCalledWith("/api/uploads/n.jpg", expect.anything());
    expect(img.caption).toContain("Nachher");
  });
});

describe("loadMcpImage — Eigentum und Grenzen", () => {
  it("filtert JEDE Abfrage auf die aufgelöste userId", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    expect(db.entry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", userId: "u1" } }),
    );
  });

  it("ein fremder Eintrag löst nicht auf", async () => {
    db.entry.findFirst.mockResolvedValue(null);
    await expect(loadMcpImage("sub", { source: "entry", entryId: "fremd" })).rejects.toThrow("Entry not found");
  });

  it("verlangt die passende Adresse zur Quelle", async () => {
    await expect(loadMcpImage("sub", { source: "entry" })).rejects.toThrow("requires entryId");
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1" })).rejects.toThrow("requires taskId and proofIndex");
  });

  it("unterscheidet ein fehlendes Foto von einem noch nicht eingereichten Nachweis", async () => {
    db.entry.findFirst.mockResolvedValue(entry({ imageUrl: null }));
    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("has no photo");

    db.task.findFirst.mockResolvedValue(taskProofRow([{ description: "d", imageUrl: null, imageExifTime: null, submittedAt: null }]));
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 1 })).rejects.toThrow("not been submitted");
  });

  it("meldet einen Index ausserhalb der Liste mit der tatsächlichen Anzahl", async () => {
    db.task.findFirst.mockResolvedValue(taskProofRow([{ description: "d", imageUrl: "/api/uploads/a.jpg", imageExifTime: null, submittedAt: fresh() }]));
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 5 }))
      .rejects.toThrow("has 1 proof(s); index 5 does not exist");
  });

  it("eine unlesbare Datei ist ein Fehler, kein leeres Bild", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    load.mockResolvedValue(null);
    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("could not be read");
  });
});

describe("loadMcpImage — der Bildersafe bleibt versiegelt", () => {
  it("fragt codeImageUrl gar nicht erst ab", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    // Das versiegelte Code-Foto darf nicht einmal selektiert werden — was nicht geladen wird, kann
    // auch nicht versehentlich ausgeliefert werden.
    const select = db.entry.findFirst.mock.calls[0][0].select as Record<string, unknown>;
    expect(select).not.toHaveProperty("codeImageUrl");
  });

  it("kennt keine Quelle, die zum Bildersafe führt", async () => {
    // @ts-expect-error — "code" ist bewusst kein McpImageSource. Der Test hält fest, dass eine
    // unbekannte Quelle scheitert, statt stillschweigend auf das Haupt-Foto zu fallen.
    await expect(loadMcpImage("sub", { source: "code", entryId: "e1" })).rejects.toThrow("Unknown source");
  });
});

describe("loadMcpImage — auf Abruf, nicht im Strom", () => {
  it("bremst über dieselbe Schicht wie die anderen Bild-Routen", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    expect(rateLimit).toHaveBeenCalledWith("mcp-image-h:u1", 4, 60 * 60_000);
    expect(rateLimit).toHaveBeenCalledWith("mcp-image-d:u1", 12, 24 * 60 * 60_000);
  });

  it("an der Stundenwand wird nichts geladen — und das Tagesbudget bleibt unberührt", async () => {
    // Die Reihenfolge ist der Punkt (Begründung in `deliver`): sonst zehrte ein Wiederholungsversuch
    // gegen die Stundenwand den Tagesvorrat auf, ohne dass je ein Bild geliefert wurde.
    rateLimit.mockResolvedValue({ limited: true, retryAfter: 42 });
    db.entry.findFirst.mockResolvedValue(entry());

    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("Hourly image limit");
    expect(load).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it("ein zu alter Griff kostet kein Kontingent", async () => {
    db.entry.findFirst.mockResolvedValue(entry({ createdAt: new Date(Date.now() - 25 * 60 * 60_000) }));

    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("older than 24h");
    expect(rateLimit).not.toHaveBeenCalled();
  });
});

describe("loadMcpImage — Reichweite: nur was frisch eingegangen ist", () => {
  it("misst am Eingang, nicht an der Ereigniszeit — Zurückdatieren macht ein Foto nicht unerreichbar", async () => {
    // `startTime` ist vom Sub verstellbar, `createdAt` nicht. Ein frisch erfasster, aber weit
    // zurückdatierter Eintrag bleibt deshalb in Reichweite.
    db.entry.findFirst.mockResolvedValue(entry({
      startTime: new Date(Date.now() - 30 * 24 * 60 * 60_000),
      createdAt: fresh(),
    }));
    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).resolves.toBeDefined();
  });

  it("gilt auch für Aufgaben-Nachweise, gemessen an der Einreichung", async () => {
    db.task.findFirst.mockResolvedValue(taskProofRow([
      { description: "d", imageUrl: "/api/uploads/a.jpg", imageExifTime: null, submittedAt: new Date(Date.now() - 25 * 60 * 60_000) },
    ]));
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 1 })).rejects.toThrow("older than 24h");
  });
});

describe("mcpImageKeyUnlocked — an DIESE Instanz gebunden", () => {
  it("schaltet frei, wenn der Schlüssel die User-id dieser Instanz ist", async () => {
    expect(await mcpImageKeyUnlocked()).toBe(true);
  });

  it("bleibt aus, wenn eine kopierte .env die id einer FREMDEN Instanz mitbringt", async () => {
    // Genau der Fall, für den der Schlüssel da ist: die Datei wanderte mit, die id gehört hier
    // niemandem.
    vi.stubEnv("MCP_IMAGE_KEY", "andere-instanz-id");
    expect(await mcpImageKeyUnlocked()).toBe(false);
  });

  // Jeder Grund einzeln: ein gemeinsamer Fall verschweigt beim Fehlschlag, welcher davon brach.
  it.each([
    ["ohne Schlüssel", { key: undefined }],
    ["ohne MCP_USERNAME", { username: undefined }],
    ["bei einem unbekannten MCP_USERNAME", { username: "gibtsnicht", userRow: null }],
    ["bei einem Datenbank-Fehler", { dbFails: true }],
  ] as const)("bleibt aus %s", async (_name, over) => {
    const o = over as { key?: string; username?: string; userRow?: null; dbFails?: boolean };
    if ("key" in o) vi.stubEnv("MCP_IMAGE_KEY", o.key);
    if ("username" in o) vi.stubEnv("MCP_USERNAME", o.username);
    if (o.dbFails) db.user.findUnique.mockRejectedValue(new Error("db down"));
    else if ("userRow" in o) db.user.findUnique.mockResolvedValue(o.userRow);

    expect(await mcpImageKeyUnlocked()).toBe(false);
  });

  it("ein Datenbank-Ausfall verbirgt das Werkzeug NICHT, liefert aber auch nichts aus", async () => {
    // Sonst fiele es bis zum nächsten Neustart aus der Liste, nur weil die DB beim ersten Request
    // gerade migrierte. Sichtbar heisst nicht erreichbar — `deliver()` prüft weiter streng.
    db.user.findUnique.mockRejectedValue(new Error("db down"));

    expect(await mcpImageToolVisible()).toBe(true);
    expect(await mcpImageKeyUnlocked()).toBe(false);
  });

  it("ohne Schlüssel bleibt es unsichtbar", async () => {
    vi.stubEnv("MCP_IMAGE_KEY", undefined);
    expect(await mcpImageToolVisible()).toBe(false);
  });

  it("hängt am Ausliefernden, nicht nur an der Registrierung", async () => {
    // Die Registrierung entscheidet, ob das Werkzeug ERSCHEINT. Käme ein Bild je über einen zweiten
    // Weg zustande, hielte der Schlüssel trotzdem — sonst wäre er eine Reihenfolge statt einer Zusage.
    vi.stubEnv("MCP_IMAGE_KEY", "falsch");
    db.entry.findFirst.mockResolvedValue(entry());

    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("not unlocked");
    expect(load).not.toHaveBeenCalled();
  });
});
