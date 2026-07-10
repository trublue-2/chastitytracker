/**
 * Shared wear-intensity scale (0..4) from a day's worn hours, on the blue heatmap gradient.
 * Used by BOTH the month calendar and the year heatmap so a day's colour — and the heatmap legend —
 * stay in sync. Level 0 = not worn; level 4 (darkest) starts at 80% of the day (≈19.2 h).
 */

/** Upper bounds (fraction of a 24 h day) for levels 1/2/3; level 4 = ≥ last value. */
export const WEAR_LEVEL_UPPER = [0.2, 0.4, 0.8] as const;

/** Hintergrund je Intensitätsstufe — EINE Quelle für Monatskalender, Jahres-Heatmap und deren
 *  Legende. Driften die Kopien auseinander, zeigt derselbe Tag zwei verschiedene Blautöne.
 *  Der Kalender legt zusätzlich eigene Textfarben darüber, damit die Tageszahl lesbar bleibt. */
export const WEAR_LEVEL_BG = ["bg-surface-raised", "bg-blue-100", "bg-blue-200", "bg-blue-400", "bg-blue-600"] as const;

export function wearIntensityLevel(hours: number): number {
  const p = Math.min(hours / 24, 1);
  if (p <= 0) return 0;
  for (let i = 0; i < WEAR_LEVEL_UPPER.length; i++) if (p < WEAR_LEVEL_UPPER[i]) return i + 1;
  return 4;
}
