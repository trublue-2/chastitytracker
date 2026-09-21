import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyCodeOnImage = vi.fn();
vi.mock("@/lib/verifyCode", () => ({ verifyCodeOnImage: (...a: unknown[]) => verifyCodeOnImage(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { runVisionSelfTest, SELF_TEST_CODE } from "./selfTest";
import { resolveVisionFrom } from "./config";

const ACTIVE = resolveVisionFrom({ provider: "mistral", keySealed: "x" }, {}, new Date(), { open: () => "key" });
const hit = (detected: string) => ({ match: true, detected, reason: null });
const miss = { match: false, detected: null, reason: "codeMissing" };

beforeEach(() => verifyCodeOnImage.mockReset());

describe("runVisionSelfTest", () => {
  it("brauchbar heisst: richtigen Code erkannt UND falschen abgelehnt", async () => {
    verifyCodeOnImage.mockResolvedValueOnce(hit(SELF_TEST_CODE)).mockResolvedValueOnce(miss);
    expect(await runVisionSelfTest(ACTIVE)).toEqual({ outcome: "ok", detected: SELF_TEST_CODE });
  });

  it("ein Modell, das jede Zahl bestätigt, fällt als Echo auf (#102)", async () => {
    verifyCodeOnImage.mockResolvedValue(hit(SELF_TEST_CODE));
    expect((await runVisionSelfTest(ACTIVE)).outcome).toBe("echo");
  });

  it("wer den richtigen Code nicht liest, wird nicht noch mit dem falschen gefragt", async () => {
    verifyCodeOnImage.mockResolvedValueOnce(miss);
    expect((await runVisionSelfTest(ACTIVE)).outcome).toBe("unreadable");
    expect(verifyCodeOnImage).toHaveBeenCalledTimes(1);
  });

  it("übersetzt Absagen des Anbieters in verständliche Gründe — aus beiden Fehlerformen", async () => {
    verifyCodeOnImage.mockRejectedValueOnce(Object.assign(new Error("401"), { status: 401 }));
    expect((await runVisionSelfTest(ACTIVE)).outcome).toBe("keyRejected");
    verifyCodeOnImage.mockRejectedValueOnce(new Error("vision HTTP 404: model not found"));
    expect((await runVisionSelfTest(ACTIVE)).outcome).toBe("modelNotFound");
    verifyCodeOnImage.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await runVisionSelfTest(ACTIVE)).outcome).toBe("requestFailed");
  });

  it("eine unvollständige Einstellung wird gar nicht erst geschickt", async () => {
    const off = resolveVisionFrom({ provider: "openai" }, {}, new Date(), { open: () => null });
    expect((await runVisionSelfTest(off)).outcome).toBe("notConfigured");
    expect(verifyCodeOnImage).not.toHaveBeenCalled();
  });
});
