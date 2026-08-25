/**
 * Shared wear-intensity scale (0..4) from a day's worn hours, auf der Helligkeits-Rampe des
 * Farbsystems.
 * Used by BOTH the month calendar and the year heatmap so a day's colour — and the heatmap legend —
 * stay in sync. Level 0 = not worn; level 4 (darkest) starts at 80% of the day (≈19.2 h).
 */

/** Upper bounds (fraction of a 24 h day) for levels 1/2/3; level 4 = ≥ last value. */
export const WEAR_LEVEL_UPPER = [0.2, 0.4, 0.8] as const;

/** Hintergrund je Intensitätsstufe — EINE Quelle für Monatskalender, Jahres-Heatmap und deren
 *  Legende. Driften die Kopien auseinander, zeigt derselbe Tag zwei verschiedene Töne.
 *
 *  Die Skala lief bis v5.3 in BLAU. Das war nicht nur eine Farbwahl, sondern ein Widerspruch:
 *  Blau bedeutet im Farbsystem `unlock` — ausgerechnet das Gegenteil von „viel getragen". Jetzt
 *  ist es eine Helligkeits-Rampe derselben Zustandsfarbe, hell wie dunkel auf dasselbe
 *  Kontrast-Profil gelegt (siehe docs/design/tokens.mjs).
 *
 *  Die Ziffer auf der Zelle kommt aus `--wear-N-text` und richtet sich nach IHRER Zelle statt
 *  nach dem Grund — auf der satten Spitze kippt sie ins Gegenteil. */
export const WEAR_LEVEL_BG = [
  "bg-[var(--wear-0)]", "bg-[var(--wear-1)]", "bg-[var(--wear-2)]", "bg-[var(--wear-3)]", "bg-[var(--wear-4)]",
] as const;

/** Textfarbe je Intensitätsstufe. Steht neben der Fläche, weil beide nur zusammen stimmen. */
export const WEAR_LEVEL_TEXT = [
  "text-[var(--wear-0-text)]", "text-[var(--wear-1-text)]", "text-[var(--wear-2-text)]",
  "text-[var(--wear-3-text)]", "text-[var(--wear-4-text)]",
] as const;

export function wearIntensityLevel(hours: number): number {
  const p = Math.min(hours / 24, 1);
  if (p <= 0) return 0;
  for (let i = 0; i < WEAR_LEVEL_UPPER.length; i++) if (p < WEAR_LEVEL_UPPER[i]) return i + 1;
  return 4;
}
