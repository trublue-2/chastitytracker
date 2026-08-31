import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die BLINDE GEGENLESUNG (`verifyCode.ts`).
 *
 * Sie fängt den Ausfall, gegen den das Stellenzahl-Gate und der Server-Ziffernvergleich prinzipiell
 * blind sind: das Modell liest gar nicht, sondern schreibt die Zahl ab, die im Prompt steht. Diese
 * Antwort ist von einer echten Lesung nicht unterscheidbar — es sei denn, man fragt ein zweites Mal
 * OHNE die Zahl zu nennen.
 *
 * Gepinnt wird deshalb dreierlei: dass der blinde Prompt den Code wirklich nicht enthält (die
 * Eigenschaft, deren Fehlen Issue #102 auslöste), WANN die zweite Frage gestellt wird, und was ihre
 * Antwort mit dem ersten Treffer macht.
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

import { verifyKontrolleCodeDetailed, buildBlindReadPrompt } from "./verifyCode";
import { visionComplete } from "@/lib/vision";
import { SEAL_VOCAB, digitCountNote } from "./verifyCode";

const vision = visionComplete as unknown as ReturnType<typeof vi.fn>;

/** Der Prompt-Text EINER Anfrage. */
const promptOf = (callIndex: number): string =>
  vision.mock.calls[callIndex][0].content.find((b: { type: string }) => b.type === "text").text;

const reply = (obj: unknown) => ({ text: JSON.stringify(obj), requestId: "r", stopReason: "stop" });

beforeEach(() => vi.clearAllMocks());

/**
 * Der Kern von #102: was das Modell antworten soll, darf nicht in der Frage stehen. Ein Prompt, der
 * die Zahl nennt, lädt zum Abschreiben ein — und genau das ist am 29.08.2026 passiert.
 */
describe("der blinde Prompt nennt die gesuchten Zahlen nicht", () => {
  it("keine Ziffernfolge in Code-Länge — die Eigenschaft, deren Fehlen #102 ausgelöst hat", () => {
    const prompt = buildBlindReadPrompt(5, null);
    expect(prompt).not.toContain("12345");
    // Die Stellenzahl (`5`) darf drinstehen, eine fünfstellige Zahl nicht.
    expect(prompt.match(/\d{5}/)).toBeNull();
  });

  it("auch im Dual-Fall keine der beiden Zahlen", () => {
    expect(buildBlindReadPrompt(5, 5).match(/\d{5}/)).toBeNull();
  });

  it("nennt die Stellenzahl — sonst weiss das Modell nicht, was zusammengehört", () => {
    expect(buildBlindReadPrompt(5, null)).toContain(digitCountNote("control code", 5));
    expect(buildBlindReadPrompt(5, 8)).toContain(digitCountNote("seal number", 8));
  });

  it("ohne eigene Siegel-Nummer ist das Siegel ein möglicher TRÄGER des Codes", () => {
    // Legacy-Kontrollen (Siegel == Code) tragen den Code auf dem Siegel. Der geführte Prompt sagt
    // das; sagte der blinde es nicht, widerspräche er bei jeder solchen Kontrolle — und verwürfe
    // eine korrekte Prüfung aus einem Grund, der mit Echo nichts zu tun hat.
    expect(buildBlindReadPrompt(5, null)).toContain(SEAL_VOCAB);
  });

  it("mit eigener Siegel-Nummer wird sie als ZWEITE Zahl gelesen, nicht als Träger", () => {
    const dual = buildBlindReadPrompt(5, 8);
    expect(dual).toContain("detectedSeal");
    expect(dual).toContain("never merge digits");
  });
});

describe("wann die Gegenlesung läuft", () => {
  it("nach einem Treffer — und ihre Frage trägt den Code nicht", async () => {
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: "12345" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(vision).toHaveBeenCalledTimes(2);
    expect(promptOf(0)).toContain("12345"); // die geführte Lesung nennt ihn — sie muss
    expect(promptOf(1)).not.toContain("12345"); // die blinde nicht
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
  it("blind dieselbe Zahl gelesen → der Treffer steht", async () => {
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: "12345" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");
    expect(res).toMatchObject({ match: true, detected: "12345", reason: null });
  });

  it("blind NICHTS gelesen → Treffer verworfen, Grund checkUnreliable", async () => {
    // Der gemessene Ausfall vom 29.08.2026: Foto ohne jeden Code, geführt trotzdem „gefunden".
    // Ohne Vorsage findet dasselbe Modell nichts — genau das ist die Signatur eines Echos.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: null }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res).toMatchObject({ match: false, reason: "checkUnreliable" });
    // Was das Modell „gelesen" hat, ist genau das, was gerade widerlegt wurde — es darf nicht als
    // Befund über das Foto in der Zeile landen.
    expect(res?.detected).toBeNull();
  });

  it("blind eine ANDERE Zahl gelesen → ebenfalls verworfen", async () => {
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: "98765" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");
    expect(res).toMatchObject({ match: false, reason: "checkUnreliable" });
  });

  it("dieselbe Handschrift-Toleranz wie die geführte Lesung", async () => {
    // „1" und „7" sind das klassische Paar (`fuzzyMatch`, gepinnt in `verifyCode.test.ts`). Die
    // Verwechslung hängt am BILD, nicht am Prompt — urteilte die Gegenlesung strenger, verwürfe sie
    // korrekte Kontrollen aus einem Grund, der mit Echo nichts zu tun hat.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: "72345" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");
    expect(res?.match).toBe(true);
  });

  it("Gegenlesung WIRFT (Timeout der Box) → Treffer bleibt stehen, nicht 'gar nicht geprüft'", async () => {
    // Ohne eigenes try/catch riss ein Aussetzer der Box die schon gelungene Hauptprüfung mit: die
    // ganze Verifikation endete auf `null`, also „nicht geprüft" ohne Grund.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockRejectedValueOnce(new Error("timeout"));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res).not.toBeNull();
    expect(res?.match).toBe(true);
  });

  it("Gegenlesung ohne verwertbare Antwort → Treffer bleibt stehen", async () => {
    // Fail-open mit Absicht — die Begründung steht an `blindReadContradicts`.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce({ text: "kein JSON hier", requestId: "r", stopReason: "stop" });

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");

    expect(res?.match).toBe(true);
  });

  it("verworfener Treffer sagt NICHTS über das Siegel — sonst warnt das Formular vor einem, das es nicht gibt", async () => {
    vision
      .mockResolvedValueOnce(reply({ detectedCode: "12345", matchCode: true, detectedSeal: "98765", matchSeal: true }))
      .mockResolvedValueOnce(reply({ detected: null, detectedSeal: null }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345", 0, "98765");

    expect(res?.reason).toBe("checkUnreliable");
    // `PruefungFormCore` liest `sealMatch === false` als Siegel-Fehlschlag und zeigte dann die Karte
    // „Siegel-Nummer stimmt nicht" — auch dort, wo gar nichts über das Siegel gesagt wurde.
    expect(res?.sealMatch).toBeUndefined();
    expect(res?.sealDetected).toBeNull();
  });

  it("Dual-Prüfung: die Gegenlesung liest BEIDE Zahlen und nennt keine davon", async () => {
    vision
      .mockResolvedValueOnce(reply({ detectedCode: "12345", matchCode: true, detectedSeal: "98765", matchSeal: true }))
      .mockResolvedValueOnce(reply({ detected: "12345", detectedSeal: "98765" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345", 0, "98765");

    expect(promptOf(1)).not.toContain("12345");
    expect(promptOf(1)).not.toContain("98765");
    expect(res?.match).toBe(true);
  });

  it("Dual: nur die SIEGEL-Nummer blind daneben → verworfen", async () => {
    // Der Deckungsverlust, den die Köder-Gegenprobe noch abfing: ein Modell, das den
    // handgeschriebenen Code wirklich liest und die Siegel-Nummer bloss abschreibt. Das Siegel ist
    // der Manipulations-Nachweis — es darf nicht ungeprüft durchgehen, nur weil der Code stimmt.
    vision
      .mockResolvedValueOnce(reply({ detectedCode: "12345", matchCode: true, detectedSeal: "98765", matchSeal: true }))
      .mockResolvedValueOnce(reply({ detected: "12345", detectedSeal: null }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345", 0, "98765");
    expect(res).toMatchObject({ match: false, reason: "checkUnreliable" });
  });

  it("das Siegel wird EXAKT verglichen, ohne Fuzzy — anders als der Code", async () => {
    // „17" ist das tolerierte Paar. Beim handgeschriebenen Code gilt es, bei der gedruckten
    // Siegel-Nummer nicht: dort wäre ein transponiertes Fremd-Siegel sonst gültig.
    vision
      .mockResolvedValueOnce(reply({ detectedCode: "12345", matchCode: true, detectedSeal: "98765", matchSeal: true }))
      .mockResolvedValueOnce(reply({ detected: "12345", detectedSeal: "98761" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345", 0, "98765");
    expect(res).toMatchObject({ match: false, reason: "checkUnreliable" });
  });

  it("unbrauchbare Antwortform → keine Aussage, der Treffer bleibt", async () => {
    // `{"code": …}` statt `{"detected": …}`: das Modell hat unsere Frage nicht beantwortet. Das ist
    // fail-open wie ein Timeout — ein FEHLENDES Feld ist etwas anderes als ein `detected: null`.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ code: "12345" }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");
    expect(res?.match).toBe(true);
  });

  it("eine Zahl statt eines Strings ist eine Lesung, keine Nicht-Antwort", async () => {
    // Lokale Modelle liefern `{"detected": 12345}`. Das als „nichts gelesen" zu werten hiesse, dem
    // Modell seine richtige Auskunft wegen des JSON-Typs abzusprechen.
    vision
      .mockResolvedValueOnce(reply({ detected: "12345", match: true }))
      .mockResolvedValueOnce(reply({ detected: 12345 }));

    const res = await verifyKontrolleCodeDetailed("/api/uploads/a.jpg", "12345");
    expect(res?.match).toBe(true);
  });
});
