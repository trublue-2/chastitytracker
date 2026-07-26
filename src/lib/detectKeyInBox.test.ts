import { describe, it, expect, vi, beforeEach } from "vitest";

// Transport + Bild-Laden gemockt, Auswertung echt (siehe vision/parse.ts: der Parser hängt bewusst
// NICHT am gemockten Provider-Modul).
vi.mock("@/lib/vision", () => ({
  visionComplete: vi.fn(),
  visionConfigured: vi.fn(() => true),
  visionProvider: vi.fn(() => "anthropic"),
}));
vi.mock("fs/promises", () => ({ readFile: vi.fn(async () => Buffer.from("x")) }));
vi.mock("sharp", () => ({
  default: () => ({
    rotate: () => ({ resize: () => ({ toBuffer: async () => Buffer.from("img") }) }),
    metadata: async () => ({ format: "jpeg", width: 100, height: 100 }),
  }),
}));

import { sep } from "path";
import { readFile } from "fs/promises";
import { detectKeyInBox } from "./verifyCode";
import { visionComplete, visionConfigured } from "@/lib/vision";

const visionMock = visionComplete as unknown as ReturnType<typeof vi.fn>;
const configuredMock = visionConfigured as unknown as ReturnType<typeof vi.fn>;

const reply = (text: string) => ({ text, requestId: "r", stopReason: "end_turn" });

describe("detectKeyInBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuredMock.mockReturnValue(true);
  });

  it("ohne Vision-Provider: null (nicht geprüft) — und kein Modell-Aufruf", async () => {
    configuredMock.mockReturnValue(false);
    expect(await detectKeyInBox("/api/uploads/box.jpg")).toBeNull();
    expect(visionMock).not.toHaveBeenCalled();
  });

  it("Schlüssel erkannt → true", async () => {
    visionMock.mockResolvedValue(reply('{"key": true}'));
    expect(await detectKeyInBox("/api/uploads/box.jpg")).toBe(true);
  });

  it("kein Schlüssel erkannt → false", async () => {
    visionMock.mockResolvedValue(reply('Here you go: {"key": false}'));
    expect(await detectKeyInBox("/api/uploads/box.jpg")).toBe(false);
  });

  it("unauswertbare Antwort → null, NICHT false", async () => {
    // Der Unterschied trägt die ganze Anzeige: `false` behauptet „kein Schlüssel drin",
    // `null` heisst „niemand hat hingesehen". Ein Modell-Aussetzer darf nicht zur Anschuldigung
    // gegen den Sub werden.
    visionMock.mockResolvedValue(reply("I cannot tell from this image."));
    expect(await detectKeyInBox("/api/uploads/box.jpg")).toBeNull();
  });

  it("JSON ohne boolean `key` → null", async () => {
    visionMock.mockResolvedValue(reply('{"key": "yes"}'));
    expect(await detectKeyInBox("/api/uploads/box.jpg")).toBeNull();
  });

  it("Vision-Fehler → null (wirft nicht)", async () => {
    visionMock.mockRejectedValue(new Error("upstream down"));
    expect(await detectKeyInBox("/api/uploads/box.jpg")).toBeNull();
  });

  it("Pfad-Guard: ein Traversal-Pfad landet nie ausserhalb von data/uploads", async () => {
    visionMock.mockResolvedValue(reply('{"key": true}'));
    await detectKeyInBox("/api/uploads/../../etc/passwd");
    // `loadImageBuffer` reduziert auf den `basename` — gelesen wird also data/uploads/passwd,
    // niemals /etc/passwd. Diese Zusicherung ist der eigentliche Schutz, nicht ein Abbruch.
    const readPath = String((readFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(readPath.endsWith(`${sep}data${sep}uploads${sep}passwd`)).toBe(true);
  });
});
