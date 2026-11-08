import { describe, it, expect } from "vitest";
import { canReviewInspection } from "./kontrollePills";

describe("canReviewInspection", () => {
  it("zeigt die Knöpfe nur bei „Nicht geprüft“", () => {
    expect(canReviewInspection("unverified")).toBe(true);
  });

  it.each(["not_required", "pending", "ai", "manual", "rejected", null, undefined])(
    "keine Knöpfe bei %s",
    (status) => {
      expect(canReviewInspection(status)).toBe(false);
    },
  );
});
