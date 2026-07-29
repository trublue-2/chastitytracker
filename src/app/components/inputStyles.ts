/** Geteilte Klassen der schmalen Inline-Eingaben in den Admin-Settings-Toggles (Zahl + Uhrzeit)
 *  und ihrer Beschriftungen. Eine Quelle für `NumberInput`, `TimeField` und `InlineSettingRow`,
 *  damit die Felder einer Zeile nicht auseinanderdriften. */
export const inlineInputCls = "w-16 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20";
export const inlineLabelCls = "text-xs text-foreground-faint";

/** Der Icon-Knopf in der Kopfzeile (Feedback, Posteingang). EINE Quelle, damit die beiden Knöpfe
 *  nebeneinander nicht auseinanderlaufen — sie stehen zeichengleich in derselben Flex-Zeile. */
export const headerIconBtnCls =
  "p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-raised transition";
