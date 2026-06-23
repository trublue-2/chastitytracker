/** Gemeinsame Zahlenformat-Helfer der MCP-Schicht (V1 + V2). Eine Quelle für die
 *  1-Dezimal-Rundung und ms→Stunden-Umrechnung, damit V1- und V2-Ausgaben nicht desynchronisieren. */

/** Auf eine Nachkommastelle runden. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Millisekunden → Stunden, auf eine Nachkommastelle gerundet. */
export const msToHours = (ms: number) => round1(ms / 3_600_000);
