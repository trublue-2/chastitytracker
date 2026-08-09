import { describe, it, expect } from "vitest";
import {
  deviceFormHref,
  CATEGORY_QUERY_KEY,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_COLOR_HEX,
  isValidCategoryColor,
  isValidCategoryIcon,
  slugifyCategoryName,
  validateCategoryInput,
  categoryNeedsDevice,
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
} from "./categoryConstants";

describe("CATEGORY_COLORS / CATEGORY_ICONS", () => {
  it("has 12 colors", () => {
    expect(CATEGORY_COLORS).toHaveLength(12);
  });

  it("has hex value for every color", () => {
    for (const c of CATEGORY_COLORS) {
      expect(CATEGORY_COLOR_HEX[c]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has 20 icons", () => {
    expect(CATEGORY_ICONS).toHaveLength(20);
  });

  it("reserves cat-steel as the first (KG default) color", () => {
    expect(CATEGORY_COLORS[0]).toBe("cat-steel");
  });
});

describe("isValidCategoryColor / isValidCategoryIcon", () => {
  it("accepts valid color slugs", () => {
    expect(isValidCategoryColor("cat-plum")).toBe(true);
    expect(isValidCategoryColor("cat-steel")).toBe(true);
  });

  it("rejects unknown colors", () => {
    expect(isValidCategoryColor("cat-pink")).toBe(false);
    expect(isValidCategoryColor("plum")).toBe(false);
    expect(isValidCategoryColor("")).toBe(false);
    expect(isValidCategoryColor(null)).toBe(false);
    expect(isValidCategoryColor(123)).toBe(false);
  });

  it("accepts valid icons", () => {
    expect(isValidCategoryIcon("Lock")).toBe(true);
    expect(isValidCategoryIcon("Crown")).toBe(true);
  });

  it("rejects unknown icons", () => {
    expect(isValidCategoryIcon("lock")).toBe(false); // case-sensitive
    expect(isValidCategoryIcon("UnknownIcon")).toBe(false);
    expect(isValidCategoryIcon(null)).toBe(false);
  });
});

describe("slugifyCategoryName", () => {
  it("lowercases and replaces spaces", () => {
    expect(slugifyCategoryName("My Plug")).toBe("my-plug");
  });

  it("strips German umlauts via NFKD + accent strip", () => {
    expect(slugifyCategoryName("Größe")).toBe("grosse");
  });

  it("converts ß to ss", () => {
    expect(slugifyCategoryName("Schloss")).toBe("schloss");
    expect(slugifyCategoryName("ßeispiel")).toBe("sseispiel");
  });

  it("strips leading/trailing dashes", () => {
    expect(slugifyCategoryName("---hello---")).toBe("hello");
  });

  it("collapses multiple non-alphanumerics to single dash", () => {
    expect(slugifyCategoryName("foo!!!bar###baz")).toBe("foo-bar-baz");
  });

  it("truncates to max length", () => {
    const name = "a".repeat(CATEGORY_SLUG_MAX_LENGTH + 20);
    expect(slugifyCategoryName(name).length).toBe(CATEGORY_SLUG_MAX_LENGTH);
  });

  it("returns empty for input with no alphanumerics", () => {
    expect(slugifyCategoryName("!!!")).toBe("");
  });
});

describe("validateCategoryInput", () => {
  it("accepts valid input", () => {
    expect(
      validateCategoryInput({ name: "Plug", color: "cat-plum", icon: "Circle" }),
    ).toBeNull();
  });

  it("rejects empty name", () => {
    const r = validateCategoryInput({ name: "" });
    expect(r?.field).toBe("name");
  });

  it("rejects name beyond max length", () => {
    const long = "a".repeat(CATEGORY_NAME_MAX_LENGTH + 1);
    const r = validateCategoryInput({ name: long });
    expect(r?.field).toBe("name");
    expect(r?.error).toMatch(/zu lang/);
  });

  it("rejects invalid color", () => {
    const r = validateCategoryInput({ color: "cat-neon" });
    expect(r?.field).toBe("color");
  });

  it("rejects invalid icon", () => {
    const r = validateCategoryInput({ icon: "DefinitelyNotAnIcon" });
    expect(r?.field).toBe("icon");
  });

  it("rejects reserved slug 'kg'", () => {
    const r = validateCategoryInput({ slug: "kg" });
    expect(r?.field).toBe("slug");
    expect(r?.error).toMatch(/reserviert/);
  });

  it("rejects slug with uppercase or special chars", () => {
    expect(validateCategoryInput({ slug: "MyPlug" })?.field).toBe("slug");
    expect(validateCategoryInput({ slug: "my plug" })?.field).toBe("slug");
    expect(validateCategoryInput({ slug: "my_plug" })?.field).toBe("slug");
  });

  it("accepts valid slug", () => {
    expect(validateCategoryInput({ slug: "my-plug-2" })).toBeNull();
  });

  it("returns null when no fields are passed (PATCH with empty body)", () => {
    expect(validateCategoryInput({})).toBeNull();
  });
});

describe("deviceFormHref — der zweite Schritt nach einer neuen Kategorie", () => {
  it("führt auf die Geräte-Seite mit vorgewählter Kategorie", () => {
    expect(deviceFormHref("c1")).toBe("/dashboard/geraete?category=c1");
  });

  it("nutzt denselben Schlüssel, den die Seite ausliest", () => {
    // Der Link setzt ihn, die Seite liest ihn — als zwei lose Zeichenketten schaltete ein
    // Umbenennen die Vorwahl still ab, und der Nutzer landete wieder beim Suchen.
    expect(new URL(deviceFormHref("c1"), "https://x").searchParams.get(CATEGORY_QUERY_KEY)).toBe("c1");
  });
});

describe("categoryNeedsDevice — Kategorie ohne bespielbares Gerät", () => {
  const wearCategory = { isBuiltIn: false, trackingEnabled: true, deviceCount: 0, hasActiveSession: false };

  it("meldet die Trage-Kategorie ohne Gerät als unfertig", () => {
    expect(categoryNeedsDevice(wearCategory)).toBe(true);
  });

  it("lässt eine Kategorie mit Gerät in Ruhe", () => {
    expect(categoryNeedsDevice({ ...wearCategory, deviceCount: 1 })).toBe(false);
  });

  it("nimmt eine laufende Session aus", () => {
    // Ein Gerät lässt sich mit offener Session archivieren. Dann steht die Kategorie bei null
    // zählbaren Geräten, wird aber gerade getragen — „hier lässt sich nichts erfassen" wäre dort
    // die falsche Aussage, direkt unter der laufenden Session.
    expect(categoryNeedsDevice({ ...wearCategory, hasActiveSession: true })).toBe(false);
  });

  it("gilt nicht für das KG — dessen Gerät kommt nicht über diese Seiten", () => {
    expect(categoryNeedsDevice({ ...wearCategory, isBuiltIn: true })).toBe(false);
  });

  it("gilt nicht für Inventar-Kategorien — dort wird nichts erfasst", () => {
    expect(categoryNeedsDevice({ ...wearCategory, trackingEnabled: false })).toBe(false);
  });
});
