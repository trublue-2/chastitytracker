/**
 * Die nativen App-Plattformen — die EINE Liste, an der Server, Registrierung und Paritäts-Test hängen.
 *
 * Wer eine Plattform ergänzt oder eine Funktion nur für eine baut, soll hier hängen bleiben:
 * `push.ts` braucht für jede Plattform einen Sender (`Record<NativePlatform, …>` — der Compiler
 * meldet eine fehlende), und `nativeParity.test.ts` prüft, dass beide App-Projekte dieselben
 * Plugins, Berechtigungen und Sperrbildschirm-Welten führen. Ein Literal `"ios"`/`"android"` für
 * die Plattform gehört nur hierher.
 *
 * Die Werte sind die von `Capacitor.getPlatform()` — die App meldet sie so bei der Registrierung.
 */
export const NATIVE_PLATFORMS = ["ios", "android"] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

export function isNativePlatformName(value: unknown): value is NativePlatform {
  return typeof value === "string" && (NATIVE_PLATFORMS as readonly string[]).includes(value);
}

/** Die Kennung der App auf beiden Plattformen (iOS-Bundle-ID = Android-Paket), wie in
 *  `capacitor.config.ts` (`appId`). Vorgabe der Passkey-Zuordnungen (AASA, assetlinks). */
export const NATIVE_APP_ID = "ch.chastitytracker.app";
