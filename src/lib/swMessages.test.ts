import { describe, it, expect, vi, afterEach } from "vitest";
import { activateWaitingSw } from "./swMessages";

// Der Bug vom 24.07.2026: der Reload-Button des Versions-Banners tat in der iOS-App sichtbar
// nichts. Grund war nicht der Reload selbst, sondern die Zeile davor — ein ungeschütztes
// `navigator.serviceWorker.getRegistration()`. In der WKWebView der Capacitor-App (und in
// Safari-Privatfenstern) gibt es `navigator.serviceWorker` gar nicht, der Zugriff warf, und die
// Reload-Zeile darunter wurde nie erreicht. Diese Tests halten fest, was der Aufrufer braucht:
// die Funktion muss in JEDER Umgebung auflösen, damit der Reload danach garantiert läuft.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Minimaler ServiceWorkerContainer-Ersatz; `waiting: null` = kein wartender Worker. */
function stubServiceWorker(waiting: { postMessage: (m: unknown) => void } | null) {
  const listeners: Record<string, (() => void)[]> = {};
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: () => Promise.resolve({ waiting }),
      addEventListener: (type: string, fn: () => void) => {
        (listeners[type] ??= []).push(fn);
      },
    },
  });
  return { fire: (type: string) => listeners[type]?.forEach((fn) => fn()) };
}

describe("activateWaitingSw", () => {
  it("löst auf, wenn es gar keinen Service Worker gibt (iOS-WKWebView, Privatfenster)", async () => {
    vi.stubGlobal("navigator", {});
    await expect(activateWaitingSw()).resolves.toBeUndefined();
  });

  it("löst auf, wenn kein Worker wartet — ohne auf controllerchange zu warten", async () => {
    stubServiceWorker(null);
    await expect(activateWaitingSw()).resolves.toBeUndefined();
  });

  it("löst auf, wenn getRegistration wirft", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: () => Promise.reject(new Error("blocked")), addEventListener: () => {} },
    });
    await expect(activateWaitingSw()).resolves.toBeUndefined();
  });

  it("schickt SKIP_WAITING und wartet, bis der neue Worker übernimmt", async () => {
    const posted: unknown[] = [];
    const sw = stubServiceWorker({ postMessage: (m) => posted.push(m) });

    let done = false;
    const pending = activateWaitingSw().then(() => { done = true; });

    await vi.waitFor(() => expect(posted).toEqual([{ type: "SKIP_WAITING" }]));
    expect(done).toBe(false); // ohne controllerchange wird noch nicht neu geladen

    sw.fire("controllerchange");
    await pending;
    expect(done).toBe(true);
  });

  it("gibt nach dem Timeout auf, wenn controllerchange ausbleibt", async () => {
    vi.useFakeTimers();
    stubServiceWorker({ postMessage: () => {} });

    const pending = activateWaitingSw();
    await vi.advanceTimersByTimeAsync(2000); // = SW_ACTIVATION_TIMEOUT_MS (modul-intern)

    await expect(pending).resolves.toBeUndefined();
  });
});
