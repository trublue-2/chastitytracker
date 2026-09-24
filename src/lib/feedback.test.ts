import { describe, expect, it } from "vitest";
import { feedbackMode, isThrowawayEmail } from "./feedback";

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
