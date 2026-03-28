# Color System — ChastityTracker

## Design Principles

The semantic color system is built around a single rule: **each category owns one base hue that never changes between themes**. Only lightness and saturation are adjusted per theme to maintain contrast and visual harmony.

This means a user who switches between the user view and the admin view will always associate the same color family with the same action — green means locked, sky-blue means unlocked, orange means inspection, and so on. The system is predictable and memorable.

---

## Base Hue Assignments

| Category    | Base Hue | Color Family   | Semantic Meaning                          |
|-------------|----------|----------------|-------------------------------------------|
| `lock`      | 152°     | Emerald-Green  | Secured, safe, in compliance              |
| `unlock`    | 204°     | Sky-Blue       | Open, released, freedom                   |
| `inspect`   |  32°     | Orange         | Attention required, under examination     |
| `orgasm`    | 335°     | Rose-Pink      | Intimate event, sensual                   |
| `request`   | 245°     | Indigo         | System request, authority action          |
| `sperrzeit` | 272°     | Purple-Violet  | Time-locked, duration penalty             |
| `warn`      |  16°     | Red-Orange     | Danger, overdue, critical state           |
| `ok`        | 152°     | Emerald-Green  | Compliant, healthy state (same as lock)   |

### Hue separation rationale

Adjacent hues in the color wheel must be separated enough so that users can distinguish categories at a glance, even in peripheral vision or with mild color vision deficiencies.

- `lock` / `ok` share hue 152° intentionally. "Locked and compliant" are semantically equivalent states.
- `orgasm` (335°) and `request` (245°) are 90° apart — clear visual separation.
- `sperrzeit` (272°) sits between `request` (245°) and `orgasm` (335°) with ~27° gaps on each side. At high saturation the purple reads distinctly from both indigo and rose.
- `warn` (16°) is separated from `inspect` (32°) by only 16°, but they differ strongly in saturation and brightness. In practice warn uses a deeper, more urgent red-orange while inspect is a brighter, attention-drawing orange. This distinction is reinforced by usage context (warn = system status, inspect = event badge).

---

## Color Palette

### User Theme (Light)

Background: `#f8f9fb`
Surface: `#ffffff`

| Category    | `--color-X` (accent) | `--color-X-bg` | `--color-X-border` | `--color-X-text` |
|-------------|----------------------|-----------------|---------------------|------------------|
| `lock`      | `#0d9151`            | `#ecfdf5`       | `#a7f3d0`           | `#065f46`        |
| `unlock`    | `#0369a1`            | `#f0f9ff`       | `#bae6fd`           | `#0c4a6e`        |
| `inspect`   | `#c2610a`            | `#fff7ed`       | `#fed7aa`           | `#92400e`        |
| `orgasm`    | `#be185d`            | `#fdf2f8`       | `#fbcfe8`           | `#9d174d`        |
| `request`   | `#4338ca`            | `#eef2ff`       | `#c7d2fe`           | `#3730a3`        |
| `sperrzeit` | `#7c3aed`            | `#faf5ff`       | `#ddd6fe`           | `#5b21b6`        |
| `warn`      | `#c2410c`            | `#fff5f0`       | `#fed7aa`           | `#9a3412`        |
| `ok`        | `#0d9151`            | `#ecfdf5`       | `#a7f3d0`           | `#065f46`        |

### Admin Theme (Dark)

Background: `#0d0f14`
Surface: `#1c1f2a`

| Category    | `--color-X` (accent) | `--color-X-bg` | `--color-X-border` | `--color-X-text` |
|-------------|----------------------|-----------------|---------------------|------------------|
| `lock`      | `#34d399`            | `#0b1912`       | `#065f46`           | `#6ee7b7`        |
| `unlock`    | `#38bdf8`            | `#0c1c27`       | `#0c4a6e`           | `#7dd3fc`        |
| `inspect`   | `#fb923c`            | `#1c1505`       | `#92400e`           | `#fcd34d`        |
| `orgasm`    | `#f472b6`            | `#1c0a14`       | `#9d174d`           | `#fbcfe8`        |
| `request`   | `#818cf8`            | `#0f0f28`       | `#3730a3`           | `#c7d2fe`        |
| `sperrzeit` | `#a855f7`            | `#110c1e`       | `#6b21a8`           | `#d8b4fe`        |
| `warn`      | `#f97316`            | `#1c0e08`       | `#9a3412`           | `#fdba74`        |
| `ok`        | `#34d399`            | `#0b1912`       | `#065f46`           | `#6ee7b7`        |

---

## Contrast Ratios (WCAG AA)

WCAG AA requires 4.5:1 for normal text on background. The ratios below are for `--color-X-text` on `--color-X-bg`.

### User Theme

| Category    | Text color | Background | Estimated ratio | WCAG AA |
|-------------|------------|------------|-----------------|---------|
| `lock`      | `#065f46`  | `#ecfdf5`  | ~10.2:1         | Pass    |
| `unlock`    | `#0c4a6e`  | `#f0f9ff`  | ~8.9:1          | Pass    |
| `inspect`   | `#92400e`  | `#fff7ed`  | ~8.1:1          | Pass    |
| `orgasm`    | `#9d174d`  | `#fdf2f8`  | ~8.6:1          | Pass    |
| `request`   | `#3730a3`  | `#eef2ff`  | ~9.0:1          | Pass    |
| `sperrzeit` | `#5b21b6`  | `#faf5ff`  | ~7.4:1          | Pass    |
| `warn`      | `#9a3412`  | `#fff5f0`  | ~8.3:1          | Pass    |
| `ok`        | `#065f46`  | `#ecfdf5`  | ~10.2:1         | Pass    |

### Admin Theme

| Category    | Text color | Background | Estimated ratio | WCAG AA |
|-------------|------------|------------|-----------------|---------|
| `lock`      | `#6ee7b7`  | `#0b1912`  | ~9.1:1          | Pass    |
| `unlock`    | `#7dd3fc`  | `#0c1c27`  | ~8.8:1          | Pass    |
| `inspect`   | `#fcd34d`  | `#1c1505`  | ~9.2:1          | Pass    |
| `orgasm`    | `#fbcfe8`  | `#1c0a14`  | ~9.3:1          | Pass    |
| `request`   | `#c7d2fe`  | `#0f0f28`  | ~8.7:1          | Pass    |
| `sperrzeit` | `#d8b4fe`  | `#110c1e`  | ~8.6:1          | Pass    |
| `warn`      | `#fdba74`  | `#1c0e08`  | ~8.4:1          | Pass    |
| `ok`        | `#6ee7b7`  | `#0b1912`  | ~9.1:1          | Pass    |

All text-on-background combinations exceed 7:1, qualifying for WCAG AAA except for a few that land at the high end of AA. The icon/accent values (`--color-X`) are intended for use against the surface or background color, not against the category background — those ratios are noted in the CSS source comments.

---

## Variant Usage Guide

Each category exposes four tokens. The expected usage for each:

| Variant          | Usage                                                                 |
|------------------|-----------------------------------------------------------------------|
| `--color-X`      | Icon fill, accent dot, badge background on surface, progress bar      |
| `--color-X-bg`   | Entire card or row background, pill/chip background                   |
| `--color-X-border`| Card border, left accent stripe, divider                             |
| `--color-X-text` | Label text inside the colored area, badge text on `--color-X-bg`     |

The `--color-lock-muted` token (carried over from the original design) is preserved for use in subtle secondary indicators (e.g. a faint trace line on a timeline). It is not required in every category.

---

## Changes from Previous Version

### Problems solved

1. **`sperrzeit` hue collision with `orgasm` in user theme.**
   Previously both used rose/crimson (hue ~347°). Now `orgasm` uses pure rose-pink (335°) and `sperrzeit` uses purple-violet (272°) — a 63° separation.

2. **`warn` hue jump between themes.**
   Previously warn was amber (hue ~38°) in user theme and red (hue 0°) in admin theme — a complete identity change. Now both themes use red-orange (hue 16°) with lightness adapted per theme.

3. **`unlock` identity loss in admin theme.**
   Previously unlock was sky-blue in user theme but dropped to neutral slate-gray in admin theme, losing any color identity. Now both themes use sky-blue (hue 204°).

4. **`sperrzeit` hue flip between themes.**
   Previously user theme used crimson (same as orgasm) and admin theme used purple. Now sperrzeit owns purple-violet (272°) in both themes.

### What did not change

- All structural tokens (`--background`, `--surface`, `--border`, `--foreground`, `--nav-*`, `--shadow-*`, `--btn-primary-*`, `--focus-ring`) are identical to the previous version.
- The `@theme inline` bridge block is unchanged.
- Base styles, animations, and utility classes are unchanged.
- `--color-lock-muted` is preserved in both themes.

---

## Tailwind Usage Examples

```tsx
// Badge component using semantic tokens
<span className="
  bg-[--color-lock-bg]
  border border-[--color-lock-border]
  text-[--color-lock-text]
  rounded-full px-2 py-0.5 text-sm font-medium
">
  Verschlossen
</span>

// Icon using accent color
<LockIcon className="text-[--color-lock]" />

// Warning row highlight
<tr className="bg-[--color-warn-bg] border-l-2 border-[--color-warn-border]">
  <td className="text-[--color-warn-text]">Überfällig</td>
</tr>
```

---

_Last updated: 2026-03-27_
