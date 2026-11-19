import { describe, it, expect } from "vitest";
import { canReviewInspection, getKombinierterPill } from "./kontrollePills";

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

describe("getKombinierterPill — wer liest", () => {
  const t = (key: string) => key;

  it("die Keyholderin liest eine ungeprüfte Kontrolle als Auftrag", () => {
    expect(getKombinierterPill("fulfilled", "unverified", t, "keyholder"))
      .toEqual({ label: "pillFulfilled – pillAwaitingReview", cls: "text-inspect" });
    // Auch eine Selbstkontrolle wartet auf ihr Urteil.
    expect(getKombinierterPill(null, "unverified", t, "keyholder")?.label).toBe("pillSelfcontrol – pillAwaitingReview");
  });

  it("der Träger liest weiter „Nicht geprüft“", () => {
    expect(getKombinierterPill("fulfilled", "unverified", t, "sub")?.label).toBe("pillFulfilled – pillUnverified");
  });

  it("Zustände ohne Eintrag bleiben in beiden Sichten gleich", () => {
    for (const status of ["open", "overdue", "missed", "withdrawn"]) {
      expect(getKombinierterPill(status, "unverified", t, "keyholder"))
        .toEqual(getKombinierterPill(status, "unverified", t, "sub"));
    }
  });
});
