import { describe, it, expect } from "vitest";
import { emailT, emailGreeting } from "./emailI18n";

// These run outside any Next.js request scope — exactly the situation of the background
// kontrollePoller (setInterval), where the old getTranslations/cookies() path would throw.
describe("emailT", () => {
  it("renders in the recipient's language without a request scope", () => {
    expect(emailT("de")("inspectionRequestedSubject")).toBe("Kontrolle angefordert");
    expect(emailT("en")("inspectionRequestedSubject")).toBe("Inspection requested");
  });

  it("falls back to German for absent/invalid locale", () => {
    expect(emailT(null)("dashboardButton")).toBe("Zum Dashboard →");
    expect(emailT("fr")("dashboardButton")).toBe("Zum Dashboard →");
  });

  it("interpolates and HTML-escapes the greeting", () => {
    expect(emailGreeting(emailT("en"), "Bob")).toBe("<p>Hi Bob,</p>");
    expect(emailGreeting(emailT("de"), "<b>x</b>")).toBe("<p>Hallo &lt;b&gt;x&lt;/b&gt;,</p>");
  });

  it("applies ICU pluralization for the inspection intro", () => {
    expect(emailT("en")("inspectionRequestedIntro", { hours: 1 })).toContain("1 hour");
    expect(emailT("en")("inspectionRequestedIntro", { hours: 4 })).toContain("4 hours");
    expect(emailT("de")("inspectionRequestedIntro", { hours: 1 })).toContain("1 Stunde ");
    expect(emailT("de")("inspectionRequestedIntro", { hours: 2 })).toContain("2 Stunden");
  });
});
