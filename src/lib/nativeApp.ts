import { isNativePlatformName, type NativePlatform } from "@/lib/nativePlatforms";

/**
 * Laufe ich in der App-Hülle, und in welcher? Die EINE Stelle für diese Frage auf der Client-Seite —
 * vorher stand sie dreifach da (`nativePush.ts`, `FeedbackSheet`, `NativeAppVersion`).
 *
 * Capacitor-Module werden nur dynamisch geladen, damit im Server-Rendering und im reinen Browser
 * nichts davon läuft. `nativePlatforms.ts` bleibt bewusst importfrei (Server UND Client).
 */

/** Synchron: die Bridge legt `window.Capacitor` in der App-WebView an; ausserhalb `null`. */
export function nativePlatformNow(): NativePlatform | null {
  if (typeof window === "undefined") return null;
  const p = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  return isNativePlatformName(p) ? p : null;
}

/** Asynchron nur aus Rücksicht auf die bestehenden Aufrufer; die Antwort ist dieselbe. */
export async function isNativePlatform(): Promise<boolean> {
  return nativePlatformNow() !== null;
}

export type NativeAppInfo = { platform: NativePlatform; version: string; build: string };

/** Version und Build der App-Hülle, wie das Gerät sie meldet; ausserhalb der App `null`. Das
 *  App-Plugin wird erst geladen, wenn feststeht, dass es eine App gibt. */
export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  const platform = nativePlatformNow();
  if (!platform) return null;
  try {
    const { App } = await import("@capacitor/app");
    const { version, build } = await App.getInfo();
    return { platform, version, build };
  } catch {
    return null;
  }
}
