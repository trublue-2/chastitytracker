import { describe, it, expect } from "vitest";
import { cleaningNotRelockedRef, entryIdFromCleaningNotRelockedRef } from "./strafurteilService";

describe("cleaningNotRelockedRef / entryIdFromCleaningNotRelockedRef", () => {
  it("round-trips an entry id", () => {
    const entryId = "clx123abc";
    expect(entryIdFromCleaningNotRelockedRef(cleaningNotRelockedRef(entryId))).toBe(entryId);
  });

  it("never collides with the bare entry id used by cleaning_limit (same entry, different refId)", () => {
    const entryId = "clx123abc";
    expect(cleaningNotRelockedRef(entryId)).not.toBe(entryId);
  });

  it("returns null for a refId that isn't a cleaning-not-relocked ref", () => {
    expect(entryIdFromCleaningNotRelockedRef("clx123abc")).toBeNull();
  });
});
