"use client";

import { useSyncExternalStore } from "react";

/**
 * Der Debug-Modus — ein Schalter auf der Changelog-Seite, der Werkzeuge für Tests und Umbauten
 * sichtbar macht (etwa „Firmware wechseln" der LockMeBox). Bewusst PRO GERÄT in `localStorage`, nicht
 * am Konto: wer am Handy an der Box bastelt, schaltet es dort ein, ohne dass es ihm auf jedem anderen
 * Gerät begegnet. Er versteckt nur Bedienelemente; die Routen dahinter prüfen selbst.
 */
const KEY = "kg-debug-mode";
/** `storage` feuert nur in ANDEREN Tabs — für dieselbe Seite meldet der Setter selbst. */
const EVENT = "kg-debug-mode-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // Privater Modus, gesperrter Speicher: dann eben aus.
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function setDebugMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useDebugMode(): [boolean, (on: boolean) => void] {
  // Server und erster Render: aus — sichtbar wird ein Debug-Werkzeug erst im Browser.
  return [useSyncExternalStore(subscribe, read, () => false), setDebugMode];
}
