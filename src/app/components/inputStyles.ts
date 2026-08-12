/** Geteilte Klassen der schmalen Inline-Eingaben in den Admin-Settings-Toggles (Zahl + Uhrzeit)
 *  und ihrer Beschriftungen. Eine Quelle für `NumberInput`, `TimeField` und `InlineSettingRow`,
 *  damit die Felder einer Zeile nicht auseinanderdriften. Rahmen, Polsterung und Fokus-Ring sind
 *  für beide identisch — sie unterscheiden sich NUR in der Breite, siehe unten. */
const inlineInputBaseCls = "border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20";

/** Zahl-Felder (`30`, `1`): zwei bis drei Ziffern, mehr Breite wäre nur Leerraum. */
export const inlineInputCls = `w-16 ${inlineInputBaseCls}`;

/** Uhrzeit-Felder brauchen mehr als die Zahl-Felder: `<input type="time">` zeigt „HH:MM" UND das
 *  browsereigene Uhr-Icon, das WebKit rechts einblendet. In `w-16` passt beides nicht — der Browser
 *  schneidet ab, und im Feld steht nur noch die Stunde („08" statt „08:00", gemeldet 08/2026 aus den
 *  Reinigungs-Fenstern). Die Breite gehört deshalb an die Eingabe-Art, nicht an die Aufruf-Stelle.
 *
 *  `w-28` statt knapper: im englischen Gebietsschema rendert dasselbe Feld „08:00 AM" — eine Breite,
 *  die nur für „08:00" reicht, verschiebt den Abschnitt bloss in die andere Sprache.
 *  `shrink-0`, weil die Felder in einer `flex`-Zeile neben einer Beschriftung stehen: ohne das
 *  schrumpfen sie auf schmalen Displays unter ihre Breite zurück und schneiden wieder ab. Umbrechen
 *  soll dort die Beschriftung, nicht die Uhrzeit. */
export const inlineTimeInputCls = `w-28 shrink-0 ${inlineInputBaseCls}`;

export const inlineLabelCls = "text-xs text-foreground-faint";

/** Der Icon-Knopf in der Kopfzeile (Feedback, Posteingang). EINE Quelle, damit die beiden Knöpfe
 *  nebeneinander nicht auseinanderlaufen — sie stehen zeichengleich in derselben Flex-Zeile. */
export const headerIconBtnCls =
  "p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-raised transition";

/**
 * Die Kopfzeile selbst — aus demselben Grund eine Quelle wie der Knopf darin, nur eine Ebene höher:
 * `Header` (Träger) und `AdminHeader` bauen dieselbe Leiste, und wer zwischen den Bereichen wechselt,
 * sieht sie unmittelbar hintereinander. Driften Höhe, Rand oder `sticky` auseinander, springt beim
 * Wechsel die ganze Seite — und zwar erst beim Wechsel, also genau dort, wo niemand hinschaut.
 *
 * Klassen statt einer Hüllen-Komponente: der Träger-Kopf rendert seine rechte Gruppe nur angemeldet,
 * der Admin-Kopf immer. Eine gemeinsame Hülle müsste beide Fälle als Slots durchreichen und wäre
 * mehr Gerüst als Ersparnis. Was drift-gefährdet ist, sind die Masse — die stehen jetzt hier.
 */
export const headerBarCls = "bg-header-bg border-b border-header-border sticky top-0 z-30 pt-safe";
export const headerRowCls = "px-4 h-14 flex items-center justify-between gap-3";
export const headerActionsCls = "flex items-center gap-2";
export const headerBrandCls =
  "font-bold text-header-text hover:opacity-80 transition text-lg tracking-tight flex items-baseline gap-2";
