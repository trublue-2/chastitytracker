import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Das Landeziel nach dem Login. Getestet ist der Zweig, der eine frisch eingerichtete Instanz
 * auf den eigenen Tracker schickt — und vor allem seine Grenzen: mit dem ersten Eintrag oder einem
 * zweiten Konto gilt wieder das gewohnte Ziel, damit sich für bestehende Nutzer nichts verschiebt.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/keyholder", () => ({ getControlledSubs: vi.fn(async () => []), canControlSub: vi.fn(async () => false) }));

import { resolveLandingPath } from "./landing";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const admin = { user: { id: "a1", role: "admin" } };

/** Die Lage der Instanz: Einstellungen des Admins, übrige Konten, eigener Eintrag. */
function instance(o: { startPage?: string; hideOwnTracker?: boolean; subs?: number; otherAccounts?: number; hasEntry?: boolean } = {}) {
  db.user.findUnique.mockResolvedValue({ startPage: o.startPage ?? "auto", hideOwnTracker: o.hideOwnTracker ?? false });
  db.user.findMany.mockResolvedValue(Array.from({ length: o.subs ?? 0 }, (_, i) => ({ id: `s${i}` })));
  db.user.count.mockResolvedValue(o.otherAccounts ?? o.subs ?? 0);
  db.entry.findFirst.mockResolvedValue(o.hasEntry ? { id: "e1" } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveLandingPath — frisch eingerichtete Instanz", () => {
  it("schickt den einzigen Admin ohne Eintrag auf den eigenen Tracker", async () => {
    instance();
    expect(await resolveLandingPath(admin)).toBe("/dashboard");
  });

  it("bleibt bei der Übersicht, sobald ein Eintrag existiert", async () => {
    instance({ hasEntry: true });
    expect(await resolveLandingPath(admin)).toBe("/admin");
  });

  it("bleibt bei der Übersicht, wenn es ein zweites Admin-Konto gibt", async () => {
    instance({ otherAccounts: 1 });
    expect(await resolveLandingPath(admin)).toBe("/admin");
  });

  it("respektiert „kein eigener Tracker“", async () => {
    instance({ hideOwnTracker: true });
    expect(await resolveLandingPath(admin)).toBe("/admin");
  });

  it("führt bei genau einem Träger weiterhin direkt zu ihm", async () => {
    instance({ subs: 1 });
    expect(await resolveLandingPath(admin)).toBe("/admin/users/s0");
  });

  it("lässt eine fest gewählte Startseite unberührt", async () => {
    instance({ startPage: "overview" });
    expect(await resolveLandingPath(admin)).toBe("/admin");
    expect(db.entry.findFirst).not.toHaveBeenCalled();
  });
});
