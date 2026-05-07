import { KG_BUILTIN_SLUG } from "@/lib/deviceCategories";

/** User-pickable color palette for DeviceCategory (per UI Designer spec).
 *  cat-steel is reserved for the KG built-in identity. The remaining 11 are user-pickable.
 *  CSS variables defined in globals.css under `--color-{slug}-{bg|border|text|muted}`. */
export const CATEGORY_COLORS = [
  "cat-steel",     // KG default — reserved for built-in
  "cat-graphite",
  "cat-leather",
  "cat-burgundy",
  "cat-rose",
  "cat-amber",
  "cat-olive",
  "cat-teal",
  "cat-indigo",
  "cat-plum",
  "cat-sand",
  "cat-slate",
] as const;

export type CategoryColor = typeof CATEGORY_COLORS[number];

/** Hex values for the user-pickable color palette (UI Designer spec, light-theme accent).
 *  Used inline in pickers and badges where Tailwind CSS variables aren't yet wired up.
 *  Full bg/border/text/muted CSS variables land in P2b alongside the dashboard styling. */
export const CATEGORY_COLOR_HEX: Record<CategoryColor, string> = {
  "cat-steel":    "#64748b",
  "cat-graphite": "#71717a",
  "cat-leather":  "#a08054",
  "cat-burgundy": "#9c2f3d",
  "cat-rose":     "#b8456e",
  "cat-amber":    "#b8861a",
  "cat-olive":    "#7a8a3a",
  "cat-teal":     "#3a8a80",
  "cat-indigo":   "#5560b0",
  "cat-plum":     "#7d4f8a",
  "cat-sand":     "#a08760",
  "cat-slate":    "#5c6878",
};

/** Curated lucide-react icon set for DeviceCategory. Suggestion mappings only —
 *  user picks freely. All names must be valid lucide-react component names. */
export const CATEGORY_ICONS = [
  "Lock",         // KG / chastity
  "KeyRound",
  "ShieldCheck",
  "Circle",       // plug
  "Diamond",
  "Gem",          // jewelry
  "Sparkles",
  "Link",         // cuffs
  "Link2",
  "Anchor",       // harness
  "Crown",        // collar
  "Heart",
  "Bookmark",     // corset
  "Shirt",
  "Feather",
  "Watch",
  "Cpu",
  "Footprints",
  "Glasses",
  "Tag",
] as const;

export type CategoryIcon = typeof CATEGORY_ICONS[number];

/** Defaults for newly-created user categories. Named exports so refactors that
 *  reorder CATEGORY_COLORS / CATEGORY_ICONS don't silently change the defaults. */
export const DEFAULT_USER_CATEGORY_COLOR: CategoryColor = "cat-graphite";
export const DEFAULT_USER_CATEGORY_ICON: CategoryIcon = "Circle";

export const CATEGORY_NAME_MAX_LENGTH = 40;
export const CATEGORY_SLUG_MAX_LENGTH = 30;
/** Reserved slugs that users cannot pick. Single source of truth: KG_BUILTIN_SLUG. */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([KG_BUILTIN_SLUG]);

/** Returns true iff the value is a valid CategoryColor. */
export function isValidCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && (CATEGORY_COLORS as readonly string[]).includes(value);
}

/** Returns true iff the value is a valid CategoryIcon. */
export function isValidCategoryIcon(value: unknown): value is CategoryIcon {
  return typeof value === "string" && (CATEGORY_ICONS as readonly string[]).includes(value);
}

/** Slugifies a name to a URL-safe lowercase identifier. Stable + idempotent. */
export function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")     // strip accents
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")          // non-alnum → dash
    .replace(/^-+|-+$/g, "")              // trim dashes
    .slice(0, CATEGORY_SLUG_MAX_LENGTH);
}

export type CategoryValidationError = { field: "name" | "slug" | "color" | "icon"; error: string };

/** Validates name + slug + color + icon for create/update. Returns first error or null. */
export function validateCategoryInput(input: {
  name?: unknown; slug?: unknown; color?: unknown; icon?: unknown;
}): CategoryValidationError | null {
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return { field: "name", error: "Name ist erforderlich" };
    }
    if (input.name.trim().length > CATEGORY_NAME_MAX_LENGTH) {
      return { field: "name", error: `Name zu lang (max. ${CATEGORY_NAME_MAX_LENGTH} Zeichen)` };
    }
  }
  if (input.slug !== undefined) {
    if (typeof input.slug !== "string" || !input.slug.trim()) {
      return { field: "slug", error: "Slug ist erforderlich" };
    }
    if (!/^[a-z0-9-]+$/.test(input.slug)) {
      return { field: "slug", error: "Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten" };
    }
    if (input.slug.length > CATEGORY_SLUG_MAX_LENGTH) {
      return { field: "slug", error: `Slug zu lang (max. ${CATEGORY_SLUG_MAX_LENGTH} Zeichen)` };
    }
    if (RESERVED_SLUGS.has(input.slug)) {
      return { field: "slug", error: "Slug ist reserviert" };
    }
  }
  if (input.color !== undefined && !isValidCategoryColor(input.color)) {
    return { field: "color", error: "Ungültige Farbe" };
  }
  if (input.icon !== undefined && !isValidCategoryIcon(input.icon)) {
    return { field: "icon", error: "Ungültiges Icon" };
  }
  return null;
}
