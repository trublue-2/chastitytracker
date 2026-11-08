import { describe, expect, it } from "vitest";
import { feedbackMode, githubIssueHref, isThrowawayEmail } from "./feedback";

describe("feedbackMode", () => {
  it("abgeschaltet schlägt alles", () => {
    expect(feedbackMode({ DISABLE_FEEDBACK: "true", PORTAL_SHARED_SECRET: "x" })).toBe("off");
  });
  it("Portal-Instanz", () => {
    expect(feedbackMode({ PORTAL_SHARED_SECRET: "x" })).toBe("standard");
  });
  it("Self-Hoster mit eigenem Posteingang braucht keinen Hinweis", () => {
    expect(feedbackMode({ FEEDBACK_UPSTREAM_URL: "https://example.org/in" })).toBe("standard");
  });
  it("Self-Hoster an den Portal-Posteingang", () => {
    expect(feedbackMode({})).toBe("selfHosted");
  });
});

describe("isThrowawayEmail", () => {
  it.each([
    "noreply3@noreply.org",
    "no-reply@gmail.com",
    "someone@noreply.github.com",
    "DoNotReply@firma.ch",
    "a@example.com",
    "a@mail.example",
    "a@foo.test",
  ])("%s ist eine Wegwerf-Adresse", (email) => {
    expect(isThrowawayEmail(email)).toBe(true);
  });

  it.each(["jane@gmail.com", "reply@firma.ch", "a@examples.com", "a@protest.ch", "bruno-reply@mail.ch", "cannotreply@mail.ch"])(
    "%s ist echt",
    (email) => {
      expect(isThrowawayEmail(email)).toBe(false);
    },
  );
});

describe("githubIssueHref", () => {
  it("füllt das Formular mit Version, öffentlicher Kennung und Herkunft", () => {
    const url = new URL(githubIssueHref({ version: "6.4.4", publicId: "0123456789abcdef", image: "fork:a/b" }));
    expect(url.searchParams.get("template")).toBe("report.yml");
    expect(url.searchParams.get("version")).toBe("6.4.4");
    expect(url.searchParams.get("instance")).toBe("0123456789abcdef");
    expect(url.searchParams.get("image")).toBe("fork:a/b");
  });

  it("lässt die Kennung weg, wenn es keine gibt (Census abgeschaltet)", () => {
    const url = new URL(githubIssueHref({ version: "6.4.4", publicId: null, image: "official" }));
    expect(url.searchParams.has("instance")).toBe(false);
  });
});
