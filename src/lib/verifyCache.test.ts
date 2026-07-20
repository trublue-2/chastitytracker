import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/verifyCode", () => ({ verifyKontrolleCodeDetailed: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));

import { verifyKontrolleCodeDeduped } from "@/lib/verifyCache";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";

const mockVerify = vi.mocked(verifyKontrolleCodeDetailed);
const OK = { detected: "12345", match: true, reason: null };

function resetCache() {
  (globalThis as unknown as { __verifyDedup?: Map<string, unknown> }).__verifyDedup?.clear();
}

describe("verifyKontrolleCodeDeduped", () => {
  beforeEach(() => {
    resetCache();
    mockVerify.mockReset();
  });

  it("teilt zwei gleichzeitige Aufrufe mit gleichem Key auf EINEN Worker-Call", async () => {
    let resolve!: (v: typeof OK) => void;
    mockVerify.mockReturnValue(new Promise<typeof OK>((r) => { resolve = r; }));

    const p1 = verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    const p2 = verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    resolve(OK);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(r1).toBe(OK);
    expect(r2).toBe(OK);
  });

  it("verwendet ein aufgelöstes Verdikt innerhalb der TTL wieder (sequenziell)", async () => {
    mockVerify.mockResolvedValue(OK);
    await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("prüft neu bei abweichendem Key (Code/Rotation/Siegel/User)", async () => {
    mockVerify.mockResolvedValue(OK);
    await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 90, null);   // Rotation
    await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "99999", 0, null);    // Code
    await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, "77777"); // Siegel
    await verifyKontrolleCodeDeduped("u2", "/uploads/a.jpg", "12345", 0, null);    // User
    expect(mockVerify).toHaveBeenCalledTimes(5);
  });

  it("cacht ein null-Verdikt NICHT (Retry möglich)", async () => {
    mockVerify.mockResolvedValueOnce(null).mockResolvedValueOnce(OK);
    const r1 = await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    const r2 = await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
    expect(r1).toBeNull();
    expect(r2).toBe(OK);
    expect(mockVerify).toHaveBeenCalledTimes(2);
  });

  it("prüft nach TTL-Ablauf neu", async () => {
    vi.useFakeTimers();
    try {
      mockVerify.mockResolvedValue(OK);
      await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
      vi.advanceTimersByTime(120_001);
      await verifyKontrolleCodeDeduped("u1", "/uploads/a.jpg", "12345", 0, null);
      expect(mockVerify).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
