import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dieselbe Invariante wie im Geräte-Check: wer `verifikationStatus: "pending"` setzt, MUSS es durch
 * einen Endzustand ersetzen. Zusätzlich hier: der `none`-Fall darf NICHT schreiben — sein Startwert
 * ist schon endgültig und unterscheidet „unverifiziert" von „nicht nötig".
 */

vi.mock("@/lib/prisma", () => ({ prisma: { entry: { update: vi.fn() } } }));
vi.mock("@/lib/verifyCache", () => ({ verifyKontrolleCodeDeduped: vi.fn() }));
vi.mock("@/lib/verifyCode", () => ({ detectSealNumber: vi.fn() }));

import { runInspectionVerification } from "./inspectionVerificationService";
import { prisma } from "@/lib/prisma";
import { verifyKontrolleCodeDeduped } from "@/lib/verifyCache";
import { detectSealNumber } from "@/lib/verifyCode";

const updateMock = prisma.entry.update as unknown as ReturnType<typeof vi.fn>;
const verifyMock = verifyKontrolleCodeDeduped as unknown as ReturnType<typeof vi.fn>;
const sealMock = detectSealNumber as unknown as ReturnType<typeof vi.fn>;

const run = (verification: Parameters<typeof runInspectionVerification>[0]["verification"]) =>
  runInspectionVerification({ entryId: "e1", userId: "u1", photoUrl: "/api/uploads/q.jpg", rotation: 0, verification });

/** Die geschriebenen Verifikations-Felder des (einzigen) Update-Aufrufs. */
const written = () => updateMock.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({});
});

describe("Code-Prüfung", () => {
  it("Treffer → 'ai', kein Grund", async () => {
    verifyMock.mockResolvedValue({ match: true });
    await run({ kind: "code", code: "12345", sealCode: null });
    expect(written()).toEqual({ verifikationStatus: "ai", verifikationReason: null, verifikationReasonDetected: null });
  });

  it("falsche Ziffern → unverifiziert MIT Grund und gelesenem Wert", async () => {
    verifyMock.mockResolvedValue({ match: false, reason: "codeWrong", detected: "12346" });
    await run({ kind: "code", code: "12345", sealCode: null });
    expect(written()).toEqual({ verifikationStatus: null, verifikationReason: "codeWrong", verifikationReasonDetected: "12346" });
  });

  it("nichts gelesen → Grund ohne Wert (ein *Missing trägt keinen)", async () => {
    verifyMock.mockResolvedValue({ match: false, reason: "codeMissing", detected: null });
    await run({ kind: "code", code: "12345", sealCode: null });
    expect(written().verifikationReasonDetected).toBeNull();
  });

  it("kein Vision-Provider (null) → unverifiziert ohne Grund, aber es WIRD geschrieben", async () => {
    verifyMock.mockResolvedValue(null);
    await run({ kind: "code", code: "12345", sealCode: null });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(written()).toEqual({ verifikationStatus: null, verifikationReason: null, verifikationReasonDetected: null });
  });

  it("die Prüfung wirft → trotzdem ein Endzustand, kein hängendes 'pending'", async () => {
    verifyMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await run({ kind: "code", code: "12345", sealCode: null });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(written().verifikationStatus).toBeNull();
  });

  it("das Siegel wird als Zusatz durchgereicht", async () => {
    verifyMock.mockResolvedValue({ match: true });
    await run({ kind: "code", code: "12345", sealCode: "98765" });
    expect(verifyMock).toHaveBeenCalledWith("u1", "/api/uploads/q.jpg", "12345", 0, "98765");
  });
});

describe("Siegel-only (Gerät ohne Code-Pflicht, Box versiegelt)", () => {
  it("Siegel stimmt → 'ai'", async () => {
    sealMock.mockResolvedValue("98765");
    await run({ kind: "seal", sealCode: "98765" });
    expect(written().verifikationStatus).toBe("ai");
    expect(verifyMock).not.toHaveBeenCalled(); // NICHT über den Code-Prompt
  });

  it("andere Nummer → sealWrong mit dem gelesenen Wert", async () => {
    sealMock.mockResolvedValue("11111");
    await run({ kind: "seal", sealCode: "98765" });
    expect(written()).toEqual({ verifikationStatus: null, verifikationReason: "sealWrong", verifikationReasonDetected: "11111" });
  });

  it("nichts lesbar → sealMissing ohne Wert", async () => {
    sealMock.mockResolvedValue(null);
    await run({ kind: "seal", sealCode: "98765" });
    expect(written()).toEqual({ verifikationStatus: null, verifikationReason: "sealMissing", verifikationReasonDetected: null });
  });
});

describe("'none' schreibt NICHT", () => {
  it("weder bei der freiwilligen Selbstkontrolle …", async () => {
    await run({ kind: "none", codeRequired: true });
    expect(updateMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
    expect(sealMock).not.toHaveBeenCalled();
  });

  it("… noch bei einem Gerät ohne Code-Pflicht — sonst wäre 'not_required' gleich wieder weg", async () => {
    await run({ kind: "none", codeRequired: false });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

it("ein gescheitertes Schreiben wirft nicht — der Aufrufer ist fire-and-forget", async () => {
  verifyMock.mockResolvedValue({ match: true });
  updateMock.mockRejectedValue(new Error("locked db"));
  await expect(run({ kind: "code", code: "12345", sealCode: null })).resolves.toBeUndefined();
});
