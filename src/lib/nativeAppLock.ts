/**
 * App-Sperre der nativen Hüllen: ob und nach welcher Schonfrist der Sperrbildschirm nach dem
 * Verlassen der App wieder nach Gesicht/Fingerabdruck fragt. Gilt JE GERÄT, nicht je Konto — die
 * Web-App schreibt den Wert über `prefSet`, gelesen wird er NATIV, bevor die WebView zeichnet:
 * iOS `UserDefaults.standard.string(forKey: "CapacitorStorage.appLock")` (`AppDelegate.swift`),
 * Android SharedPreferences-Datei `CapacitorStorage`, Schlüssel `appLock` (`MainActivity.java`).
 * `nativeParity.test.ts` hält beide Seiten und die Werte gegen diese Datei.
 *
 * Werte: `off` = keine Sperre; sonst Minuten Schonfrist (`0` = sofort). Fehlt der Wert oder ist er
 * unbekannt, gilt `0` — das Verhalten vor V3, damit eine ältere App nie ungesperrt aufgeht.
 *
 * Importfrei (bis auf den Prefs-Zugriff), weil Client-Komponente und Test sie teilen.
 */
import { prefGet, prefSet } from "@/lib/capacitorPrefs";

export const APP_LOCK_PREF_KEY = "appLock";
export const APP_LOCK_OPTIONS = ["off", "0", "1", "5", "15", "60"] as const;
export type AppLockOption = (typeof APP_LOCK_OPTIONS)[number];
const APP_LOCK_DEFAULT: AppLockOption = "0";

function parseAppLock(value: string | null): AppLockOption {
  return (APP_LOCK_OPTIONS as readonly string[]).includes(value ?? "") ? (value as AppLockOption) : APP_LOCK_DEFAULT;
}

export async function readAppLock(): Promise<AppLockOption> {
  return parseAppLock(await prefGet(APP_LOCK_PREF_KEY));
}

export function writeAppLock(value: AppLockOption): Promise<void> {
  return prefSet(APP_LOCK_PREF_KEY, value);
}
