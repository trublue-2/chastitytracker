import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `announceBoxCommand`: jede Box-Art bekommt ihre Ansage und nur ihre — die Heimdall-Box den
 * Instant-Push, das Handy eines LockMeBox-Trägers die Mitteilung „Box wartet", Letztere nur, wenn der
 * Träger Push auf dieser Stufe zulässt.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/heimdallNotify", () => ({ notifyHeimdall: vi.fn() }));
vi.mock("@/lib/deliveryChannels", () => ({ deliveryChannels: vi.fn() }));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));

import { announceBoxCommand } from "./boxCommandNotify";
import { prisma } from "@/lib/prisma";
import { notifyHeimdall } from "@/lib/heimdallNotify";
import { deliveryChannels } from "@/lib/deliveryChannels";
import { firePush } from "@/lib/push";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const USER = { id: "u1", username: "sub", locale: "de", email: null, telegramChatId: null, notifyMail: null, notifyPush: null, notifyTelegram: null };
const withBoxes = (...kinds: string[]) => ({ ...USER, boxStatuses: kinds.map((kind) => ({ kind })) });
/** Die Mitteilung läuft unawaited — einmal die Mikrotask-Schlange leeren. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLE_BRIDGE_KEY", "000102030405060708090a0b0c0d0e0f");
  db.user.findUnique.mockResolvedValue(withBoxes("lockmebox"));
  vi.mocked(deliveryChannels).mockResolvedValue({ mail: false, push: true, telegram: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("announceBoxCommand", () => {
  it("schickt dem LockMeBox-Träger die Mitteilung — und Heimdall nichts", async () => {
    announceBoxCommand("u1", "lock");
    await settle();
    expect(firePush).toHaveBeenCalledWith("u1", "Box wartet", expect.stringContaining("schliessen"), "/dashboard");
    expect(notifyHeimdall).not.toHaveBeenCalled();
  });

  it("nennt beim Öffnen das Öffnen", async () => {
    announceBoxCommand("u1", "open");
    await settle();
    expect(firePush).toHaveBeenCalledWith("u1", "Box wartet", expect.stringContaining("öffnen"), "/dashboard");
  });

  it("Heimdall-Box: Instant-Push an Heimdall, keine Mitteilung — sie vollzieht selbst", async () => {
    db.user.findUnique.mockResolvedValue(withBoxes("heimdall"));
    announceBoxCommand("u1", "lock");
    await settle();
    expect(notifyHeimdall).toHaveBeenCalledWith("sub", "lock");
    expect(firePush).not.toHaveBeenCalled();
  });

  it("keine Mitteilung, wenn der Träger Push auf dieser Stufe nicht zulässt", async () => {
    vi.mocked(deliveryChannels).mockResolvedValue({ mail: true, push: false, telegram: false });
    announceBoxCommand("u1", "lock");
    await settle();
    expect(firePush).not.toHaveBeenCalled();
  });

  it("keine Mitteilung ohne Brücken-Schlüssel — die LockMeBox ist dann ganz aus", async () => {
    vi.unstubAllEnvs();
    announceBoxCommand("u1", "lock");
    await settle();
    expect(firePush).not.toHaveBeenCalled();
  });
});
