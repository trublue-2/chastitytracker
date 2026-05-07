import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_COLOR_HEX,
  isValidCategoryColor,
  isValidCategoryIcon,
  slugifyCategoryName,
  validateCategoryInput,
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
