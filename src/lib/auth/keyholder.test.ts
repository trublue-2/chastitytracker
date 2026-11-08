import { describe, it, expect, vi, beforeEach } from "vitest";

// entryManageAccess ruft isKeyholderOf → prisma.adminUserRelationship.findUnique nur im
// Keyholder-Zweig auf (Admin/Owner werden vorher kurzgeschlossen).
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUserRelationship: { findUnique: vi.fn() } },
}));

import { entryManageAccess } from "./keyholder";
import { prisma } from "@/lib/prisma";

const relMock = prisma.adminUserRelationship.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("entryManageAccess", () => {
  beforeEach(() => relMock.mockReset());

  it("denies an unauthenticated actor without touching the DB", async () => {
    expect(await entryManageAccess(undefined, undefined, "owner")).toEqual({ allowed: false, elevated: false });
    expect(relMock).not.toHaveBeenCalled();
  });

  it("lets the owner edit but keeps them anti-cheat bound (not elevated)", async () => {
    expect(await entryManageAccess("owner", "user", "owner")).toEqual({ allowed: true, elevated: false });
    expect(relMock).not.toHaveBeenCalled();
  });

  it("gives a global admin full elevated access to any entry, including their own", async () => {
    expect(await entryManageAccess("admin", "admin", "someSub")).toEqual({ allowed: true, elevated: true });
    expect(await entryManageAccess("admin", "admin", "admin")).toEqual({ allowed: true, elevated: true });
    expect(relMock).not.toHaveBeenCalled();
  });

  it("grants a keyholder of the owner elevated (scoped-admin) access", async () => {
    relMock.mockResolvedValue({ id: "rel1" });
    expect(await entryManageAccess("keyholder", "user", "sub")).toEqual({ allowed: true, elevated: true });
    expect(relMock).toHaveBeenCalledOnce();
  });

  it("denies a non-owner, non-admin, non-keyholder", async () => {
    relMock.mockResolvedValue(null);
    expect(await entryManageAccess("stranger", "user", "sub")).toEqual({ allowed: false, elevated: false });
  });
});
