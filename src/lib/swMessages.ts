import { isNativePlatform } from "@/lib/nativePush";

/**
 * Sends a message to the active Service Worker if one is registered.
 * Fire-and-forget — callers do not need to await.
 */
export function postSwMessage(message: Record<string, unknown>): void {
  if (typeof navigator === "undefined") return;
  navigator.serviceWorker?.controller?.postMessage(message);
}

/** So lange warten wir höchstens darauf, dass der neue Worker die Seite übernimmt. */
const SW_ACTIVATION_TIMEOUT_MS = 2000;

/**
 * Aktiviert einen wartenden Service Worker und wartet, bis er die Seite übernommen hat.
 *
 * Löst IMMER auf — der Aufrufer (Reload nach Versions-Update) darf sich darauf verlassen, dass es
 * danach weitergeht:
 *  - `navigator.serviceWorker` existiert nicht überall: in der iOS-WKWebView der Capacitor-App und
 *    in Safari-Privatfenstern fehlt es ganz. Ein ungeschützter Zugriff warf dort eine TypeError,
 *    die den nachfolgenden Reload verschluckte.
 *  - Bleibt `controllerchange` aus, greift der Timeout. Ohne das Warten bedient der ALTE Worker den
 *    Reload weiter, und die neue Version käme erst beim übernächsten Start.
 */
export async function activateWaitingSw(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const waiting = (await navigator.serviceWorker.getRegistration())?.waiting;
    if (!waiting) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SW_ACTIVATION_TIMEOUT_MS);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => { clearTimeout(timer); resolve(); },
        { once: true },
      );
      waiting.postMessage({ type: "SKIP_WAITING" });
    });
  } catch {
    // Registrierung nicht lesbar (z.B. blockierter Storage-Zugriff) — der Aufrufer lädt trotzdem neu.
  }
}

/**
 * Clears the SW's user-specific API response cache and IndexedDB entries store.
 * Call on login and logout so no stale data from a previous user persists.
 */
export function clearSwUserCache(): void {
  postSwMessage({ type: "CLEAR_USER_CACHE" });
}

/**
 * Setzt das App-Badge auf die Zahl ungelesener Nachrichten (0 = räumen).
 *
 * ZWEI Wege, weil es zwei Plattformen sind:
 *  - **Nativ (Capacitor/iOS):** die Web-Badging-API existiert in der WKWebView NICHT. Ohne Plugin
 *    kann die App das Badge gar nicht anfassen — die Zahl käme ausschliesslich aus dem APNs-Payload
 *    und bliebe nach dem Lesen stehen, bis der nächste Push sie korrigiert.
 *  - **Browser/PWA:** `navigator.setAppBadge`, dort wo es der Browser kennt.
 *
 * Gehört aus demselben Grund hierher wie die Service-Worker-Zugriffe darüber: jeder dieser Zugriffe
 * fehlt auf mindestens einer Plattform, und ungeschützt verschluckt er die umgebende Aktion.
 * Bewusst am ZUSTAND aufgerufen (App-Start, Resume, nach dem Lesen), nicht am Klick auf eine
 * Benachrichtigung.
 *
 * Fire-and-forget: der Aufrufer wartet nicht. Das Badge ist Beiwerk, nie ein Grund, die auslösende
 * Aktion scheitern zu lassen.
 */
export function setAppBadgeSafe(unread: number): void {
  void applyBadge(unread).catch(() => { /* Badge ist Beiwerk */ });
}

async function applyBadge(unread: number): Promise<void> {
  if (await isNativePlatform()) {
    const { Badge } = await import("@capawesome/capacitor-badge");
    if (unread > 0) await Badge.set({ count: unread });
    else await Badge.clear();
    return;
  }

  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (unread > 0) await nav.setAppBadge?.(unread);
  else await nav.clearAppBadge?.();
}
