import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Codewechsel-Vergleich an der Datenbank und am Vision-Provider (#115): wann geprüft wird, wie
 * oft gelesen wird, was gespeichert und wem gemeldet wird — und dass nirgends Ziffern hinausgehen.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/vision", () => ({ visionConfigured: vi.fn(async () => true) }));
vi.mock("@/lib/kontrollen/verifyCode", () => ({ detectLockboxCode: vi.fn() }));
vi.mock("@/lib/auth/keyholder", () => ({
  // Ein globaler Admin ohne Zuordnung und die zugeordnete Keyholderin.
  getControllerAudience: vi.fn(async () => ({ controllers: [{ id: "admin1" }, { id: "kh1" }], username: "sub" })),
  getKeyholdersOfUser: vi.fn(async () => [{ id: "kh1", username: "kh", role: "user" }]),
}));
vi.mock("@/lib/messages/notify", () => ({ notifyControllers: vi.fn(async () => undefined) }));
vi.mock("@/lib/queries", () => ({ isCodePhotoRevealed: vi.fn(async () => true) }));

import { prisma } from "@/lib/prisma";
import { visionConfigured } from "@/lib/vision";
import { detectLockboxCode } from "@/lib/kontrollen/verifyCode";
import { notifyControllers } from "@/lib/messages/notify";
import { isCodePhotoRevealed } from "@/lib/queries";
import { checkCodeChange, clearCodeReadCache, codeChangeCheckApplies, runCodeChangeCheck } from "./lockboxCodeCheckService";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const PREV = { id: "e0", codeImageUrl: "/api/uploads/prev.jpg", startTime: new Date("2026-10-01T08:00:00Z") };

/** Liest je Bild-Pfad die angegebenen Ziffern (oder eine Folge von Lesungen). */
function readsBy(map: Record<string, (string | null)[]>) {
  const counters: Record<string, number> = {};
  vi.mocked(detectLockboxCode).mockImplementation(async (url: string) => {
    const i = counters[url] ?? 0;
    counters[url] = i + 1;
    const seq = map[url] ?? [null];
    return seq[Math.min(i, seq.length - 1)];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCodeReadCache();
  vi.mocked(visionConfigured).mockResolvedValue(true);
  vi.mocked(isCodePhotoRevealed).mockResolvedValue(true);
  db.entry.findFirst.mockResolvedValue(PREV);
  db.entry.update.mockResolvedValue({});
});

const AT = new Date("2026-10-17T08:00:00Z");
const run = (codeImageUrl = "/api/uploads/new.jpg") => runCodeChangeCheck({ entryId: "e1", userId: "u1", codeImageUrl, startTime: AT });

describe("checkCodeChange", () => {
  it("prüft ohne Vision-Provider gar nicht", async () => {
    vi.mocked(visionConfigured).mockResolvedValue(false);
    expect(await checkCodeChange("u1", "/api/uploads/new.jpg")).toBeNull();
    expect(detectLockboxCode).not.toHaveBeenCalled();
  });

  it("vergleicht nie mit einem noch gesperrten Foto — sonst wäre es ein Orakel auf den Code", async () => {
    vi.mocked(isCodePhotoRevealed).mockResolvedValue(false);
    readsBy({ "/api/uploads/new.jpg": ["1234"], "/api/uploads/prev.jpg": ["1234"] });
    expect(await checkCodeChange("u1", "/api/uploads/new.jpg")).toBeNull();
    expect(detectLockboxCode).not.toHaveBeenCalled();
  });

  it("ohne früheres Code-Foto: `first`, ohne zu lesen", async () => {
    db.entry.findFirst.mockResolvedValue(null);
    expect(await checkCodeChange("u1", "/api/uploads/new.jpg")).toBe("first");
    expect(detectLockboxCode).not.toHaveBeenCalled();
  });

  it("liest jedes Foto zweimal und vergleicht", async () => {
    readsBy({ "/api/uploads/new.jpg": ["1234"], "/api/uploads/prev.jpg": ["1234"] });
    expect(await checkCodeChange("u1", "/api/uploads/new.jpg")).toBe("same");
    expect(detectLockboxCode).toHaveBeenCalledTimes(4);
  });

  it("zwei abweichende Lesungen desselben Fotos sind unsicher", async () => {
    readsBy({ "/api/uploads/new.jpg": ["1234", "1284"], "/api/uploads/prev.jpg": ["5678"] });
    expect(await checkCodeChange("u1", "/api/uploads/new.jpg")).toBe("uncertain");
  });

  it("die Prüfung nach dem Speichern liest die Fotos der Vorabprüfung nicht erneut", async () => {
    readsBy({ "/api/uploads/new.jpg": ["1234"], "/api/uploads/prev.jpg": ["5678"] });
    await checkCodeChange("u1", "/api/uploads/new.jpg");
    await run();
    expect(detectLockboxCode).toHaveBeenCalledTimes(4);
  });

  it("eine leere Lesung bleibt nicht liegen — sie kann ein Fehlschlag gewesen sein", async () => {
    readsBy({ "/api/uploads/new.jpg": [null], "/api/uploads/prev.jpg": ["5678"] });
    await checkCodeChange("u1", "/api/uploads/new.jpg");
    await checkCodeChange("u1", "/api/uploads/new.jpg");
    // new.jpg zweimal je zwei Lesungen, prev.jpg nur beim ersten Mal.
    expect(detectLockboxCode).toHaveBeenCalledTimes(6);
  });
});

describe("codeChangeCheckApplies", () => {
  it("nur mit Code-Foto und Vision-Provider", async () => {
    expect(await codeChangeCheckApplies("/api/uploads/new.jpg")).toBe(true);
    expect(await codeChangeCheckApplies(null)).toBe(false);
    vi.mocked(visionConfigured).mockResolvedValue(false);
    expect(await codeChangeCheckApplies("/api/uploads/new.jpg")).toBe(false);
  });
});

describe("runCodeChangeCheck", () => {
  it("schreibt das Urteil an den Verschluss und meldet `same` — ohne Ziffern", async () => {
    readsBy({ "/api/uploads/new.jpg": ["0472"], "/api/uploads/prev.jpg": ["0472"] });
    await run();
    expect(db.entry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { codeChangeCheck: "same" } });
    const [, recipients, content] = vi.mocked(notifyControllers).mock.calls[0];
    // Nur die zugeordnete Keyholderin: die Vergleichsansicht gibt es für den Admin ohne Zuordnung nicht.
    expect(recipients.map((r) => r.id)).toEqual(["kh1"]);
    expect(content).toMatchObject({
      messageKey: "lockboxCodeSameMessageKeyholder",
      url: "/admin/users/u1/bildersafe/e1",
      inbox: { ref: { type: "lockboxCode", id: "e1" }, once: true },
    });
    expect(JSON.stringify(content)).not.toContain("0472");
  });

  it("sucht das frühere Foto vor dem geprüften Verschluss, ohne ihn selbst", async () => {
    readsBy({});
    await run();
    expect(db.entry.findFirst.mock.calls[0][0].where).toMatchObject({
      userId: "u1", type: "VERSCHLUSS", codeImageUrl: { not: null }, id: { not: "e1" }, startTime: { lt: AT },
    });
  });

  it("meldet einen unsicheren Vergleich", async () => {
    readsBy({ "/api/uploads/new.jpg": [null], "/api/uploads/prev.jpg": ["5678"] });
    await run();
    expect(vi.mocked(notifyControllers).mock.calls[0][2].messageKey).toBe("lockboxCodeUncertainMessageKeyholder");
  });

  it("ein sicherer Wechsel wird gespeichert, aber nicht gemeldet", async () => {
    readsBy({ "/api/uploads/new.jpg": ["1111"], "/api/uploads/prev.jpg": ["2222"] });
    await run();
    expect(db.entry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { codeChangeCheck: "different" } });
    expect(notifyControllers).not.toHaveBeenCalled();
  });

  it("ein Fehlschlag ersetzt `pending` durch `error` und wirft nie", async () => {
    db.entry.findFirst.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(run()).resolves.toBeUndefined();
    expect(db.entry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { codeChangeCheck: "error" } });
    expect(notifyControllers).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
