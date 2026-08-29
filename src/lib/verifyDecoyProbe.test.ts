import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die KÖDER-GEGENPROBE (`verifyCode.ts`).
 *
 * Sie fängt den Ausfall, gegen den das Stellenzahl-Gate und der Server-Ziffernvergleich prinzipiell
 * blind sind: das Modell liest gar nicht, sondern schreibt die Zahl ab, die im Prompt steht. Diese
 * Antwort ist von einer echten Lesung nicht unterscheidbar — es sei denn, man fragt zusätzlich nach
 * einer Zahl, die es nicht gibt.
 *
 * Gepinnt wird deshalb das Zusammenspiel, nicht die Auswertung einer einzelnen Antwort: WANN die
 * zweite Frage überhaupt gestellt wird, und was ihre Antwort mit dem ersten Treffer macht.
 */

vi.mock("@/lib/vision", () => ({
  visionComplete: vi.fn(),
  visionConfigured: () => true,
  visionProvider: () => "local",
}));
// Bild-Laden ausgeklammert: geprüft wird die Fragen-Folge, nicht die Vorverarbeitung.
vi.mock("fs/promises", () => ({ readFile: vi.fn().mockResolvedValue(Buffer.from("x")) }));
vi.mock("sharp", () => ({
  default: () => ({
    rotate: () => ({
      resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from("img") }) }),
    }),
  }),
}));

import { verifyKontrolleCodeDetailed, fuzzyMatch } from "./verifyCode";
import { visionComplete } from "@/lib/vision";

const vision = visionComplete as unknown as ReturnType<typeof vi.fn>;

/** Der Prompt-Text EINER Anfrage. Beide Auswerter unten hängen daran — als ein Helfer, damit eine
 *  Prompt-Umformulierung sie gemeinsam bricht statt einzeln. */
const promptOf = (callIndex: number): string =>
  vision.mock.calls[callIndex][0].content.find((b: { type: string }) => b.type === "text").text;

/** Der Code, nach dem ein Prompt sucht. Die erste Anfrage trägt den echten, die Gegenprobe den Köder. */
const codeInPrompt = (prompt: string): string => prompt.match(/Look for the specific number (\d+)/)![1];

const askedCode = (callIndex: number): string => codeInPrompt(promptOf(callIndex));

const reply = (obj: unknown) => ({ text: JSON.stringify(obj), requestId: "r", stopReason: "stop" });

beforeEach(() => vi.clearAllMocks());

describe("wann die Gegenprobe läuft", () => {
  it("nach einem Treffer — und sie fragt nach einer ANDEREN Zahl", async () => {
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: null, match: false }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(vision).toHaveBeenCalledTimes(2);
    expect(askedCode(0)).toBe("12345");
    const decoy = askedCode(1);
    expect(decoy).not.toBe("12345");
    expect(decoy).toHaveLength(5);
    // Der Köder darf dem echten Code auch unter der Fuzzy-Toleranz nicht gleichen — sonst zählte
    // eine ECHTE Lesung als Echo und verwürfe eine korrekte Kontrolle.
    expect(fuzzyMatch(decoy, "12345")).toBe(false);
    expect(res?.match).toBe(true);
    expect(res?.reason).toBeNull();
  });

  it("NICHT nach einem Nicht-Treffer — der ist schon das strenge Ergebnis", async () => {
    vision.mockResolvedValueOnce(reply({ detected: null, match: false }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(vision).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ match: false, reason: "codeMissing" });
  });
});

describe("was ihre Antwort mit dem Treffer macht", () => {
  it("Modell bestätigt auch die erfundene Zahl → Treffer verworfen, Grund checkUnreliable", async () => {
    // Der gemessene Ausfall vom 29.08.2026: Foto ohne jeden Code, trotzdem zweimal „gefunden".
    vision.mockImplementation(async (req: { content: { type: string; text?: string }[] }) => {
      const asked = codeInPrompt(req.content.find((b) => b.type === "text")!.text!);
      return reply({ detected: asked, match: true }); // echot, was immer gefragt wird
    });

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res).toMatchObject({ match: false, reason: "checkUnreliable" });
    // Was das Modell „gelesen" hat, ist genau das, was gerade widerlegt wurde — es darf nicht als
    // Befund über das Foto in der Zeile landen.
    expect(res?.detected).toBeNull();
  });

  it("Gegenprobe WIRFT (Timeout der Box) → Treffer bleibt stehen, nicht 'gar nicht geprüft'", async () => {
    // Ohne eigenes try/catch riss ein Aussetzer der Box die schon gelungene Hauptprüfung mit: die
    // ganze Verifikation endete auf `null`, also „nicht geprüft" ohne Grund.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockRejectedValueOnce(new Error("timeout"));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res).not.toBeNull();
    expect(res?.match).toBe(true);
  });

  it("verworfener Treffer sagt NICHTS über das Siegel — sonst warnt das Formular vor einem, das es nicht gibt", async () => {
    vision.mockImplementation(async (req: { content: { type: string; text?: string }[] }) =>
      reply({ detected: codeInPrompt(req.content.find((b) => b.type === "text")!.text!), match: true }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res?.reason).toBe("checkUnreliable");
    // `PruefungFormCore` liest `sealMatch === false` als Siegel-Fehlschlag und zeigte dann die Karte
    // „Siegel-Nummer stimmt nicht" — bei einer Prüfung ganz ohne Siegel.
    expect(res?.sealMatch).toBeUndefined();
    expect(res?.sealDetected).toBeNull();
  });

  it("Gegenprobe ohne verwertbare Antwort → Treffer bleibt stehen", async () => {
    // Fail-open mit Absicht — die Begründung steht an `decoyEcho`.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce({ text: "kein JSON hier", requestId: "r", stopReason: "stop" });

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res?.match).toBe(true);
  });

  it("Dual-Prüfung: die Gegenprobe fragt in der EINZEL-Form, prüft aber denselben Treffer", async () => {
    vision
      .mockResolvedValueOnce(reply({ detectedCode: "12345", matchCode: true, detectedSeal: "98765", matchSeal: true }))
      .mockResolvedValueOnce(reply({ detected: null, match: false }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345", 0, "98765");

    expect(promptOf(1)).not.toContain("SEAL NUMBER");
    expect(askedCode(1)).not.toBe("98765");
    expect(res?.match).toBe(true);
  });
});
