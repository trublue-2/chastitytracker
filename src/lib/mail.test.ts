import { describe, it, expect } from "vitest";
import { escHtml, noticeBoxHtml, dashboardEmailHtml, appBaseUrl } from "./mail";
import { EMAIL_BUTTON_COLORS } from "./constants";

/** Kollabiert Whitespace zwischen Tags — die Einrückung des Templates ist irrelevant fürs Rendering. */
const norm = (html: string) => html.replace(/>\s+</g, "><").trim();

describe("appBaseUrl", () => {
  it("falls back to localhost when NEXTAUTH_URL is unset", () => {
    const prev = process.env.NEXTAUTH_URL;
    delete process.env.NEXTAUTH_URL;
    expect(appBaseUrl()).toBe("http://localhost:3000");
    if (prev !== undefined) process.env.NEXTAUTH_URL = prev;
  });
});

describe("noticeBoxHtml", () => {
  it("escapes the text and uses the shared yellow style", () => {
    const html = noticeBoxHtml("Label", '<script>"x"</script>');
    expect(html).toContain("background:#fef9c3");
    expect(html).toContain("border:1px solid #fde047");
    expect(html).toContain(">Label<");
    expect(html).toContain(escHtml('<script>"x"</script>'));
    expect(html).not.toContain("<script>");
  });
});

describe("dashboardEmailHtml", () => {
  it("defaults to the indigo dashboard button", () => {
    const html = dashboardEmailHtml("Titel", "<p>Body</p>", "Zum Dashboard");
    expect(html).toContain(`background:${EMAIL_BUTTON_COLORS.default}`);
    expect(html).toContain(`href="${appBaseUrl()}/dashboard"`);
    expect(html).toContain("Zum Dashboard");
  });

  // Pinnt die Bestandsfarben: die Token-Extraktion darf KEINE Mail-Farbe verändert haben.
  it("keeps the historic CTA colours", () => {
    expect(EMAIL_BUTTON_COLORS.default).toBe("#4f46e5");
    expect(EMAIL_BUTTON_COLORS.inspection).toBe("#f97316");
    expect(EMAIL_BUTTON_COLORS.orgasm).toBe("#be185d");
  });

  it("inserts the heading raw (callers escape when needed)", () => {
    expect(dashboardEmailHtml("<b>x</b>", "", "B")).toContain("<h2 style=\"color:#1e293b\"><b>x</b></h2>");
  });

  it("honours buttonColor + buttonHref overrides", () => {
    const html = dashboardEmailHtml("T", "", "Los", { buttonColor: "#f97316", buttonHref: "https://x.test/p?c=1" });
    expect(html).toContain("background:#f97316");
    expect(html).toContain('href="https://x.test/p?c=1"');
  });

  it("renders afterHtml AFTER the button, still inside the frame", () => {
    const html = norm(dashboardEmailHtml("T", "<p>inner</p>", "Los", { afterHtml: "<p>fallback</p>" }));
    const buttonEnd = html.indexOf("</a></p>");
    expect(buttonEnd).toBeGreaterThan(-1);
    expect(html.indexOf("<p>fallback</p>")).toBeGreaterThan(buttonEnd);
    expect(html.indexOf("<p>inner</p>")).toBeLessThan(buttonEnd);
    expect(html.endsWith("</div>")).toBe(true);
  });

  it("omits the afterHtml slot entirely when unused", () => {
    expect(norm(dashboardEmailHtml("T", "<p>i</p>", "B"))).toMatch(/<\/a><\/p><\/div>$/);
  });
});
