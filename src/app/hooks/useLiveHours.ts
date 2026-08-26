"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Shared singleton tick — one interval for all useLiveHours consumers.
 * Pauses when tab is hidden to save battery.
 */
let listeners = new Set<() => void>();
let tickMs = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stop();
  };
}

function start() {
  tickMs = Date.now();
  intervalId = setInterval(() => {
    tickMs = Date.now();
    listeners.forEach((cb) => cb());
  }, 1000);
}

function stop() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function getSnapshot() {
  return tickMs;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (listeners.size === 0) return;
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });
}

/**
 * Adds real-time elapsed hours to a server-computed base value.
 * All consumers share a single 1s interval. Pauses when tab is hidden.
 */
export function useLiveHours(
  baseH: number,
  serverNowIso: string,
  active: boolean,
): number {
  const tick = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  if (!active) return baseH;
  const serverNowMs = new Date(serverNowIso).getTime();
  // Auf dem SERVER liefert der Store 0 — dort gilt die Server-Zeit, also kein Zuwachs.
  //
  // Ohne diesen Rückfall rechnete die Zeile `(0 - serverNowMs)` und kam auf rund minus 497 000
  // Stunden: die Epoche, in Stunden, mit Vorzeichen. Im ausgelieferten HTML stand daraufhin
  // „496 602h fehlen" statt „noch 44min" — sichtbar im ersten Bild jedes Aufrufs und dauerhaft
  // ohne JavaScript. Dass es niemandem auffiel, lag nur daran, dass die Hydration den Wert
  // meistens innerhalb eines Frames ersetzt.
  //
  // `useNowMs` weiter unten macht genau das schon richtig und begründet es auch — die beiden
  // Haken hätten von Anfang an dieselbe Zeile haben müssen.
  const nowMs = tick || serverNowMs;
  if (!Number.isFinite(nowMs)) return baseH;
  const deltaH = (nowMs - serverNowMs) / 3_600_000;
  return baseH + deltaH;
}

/**
 * Derselbe Takt, aber als ZEITPUNKT statt als Stundenzuwachs.
 *
 * Gebraucht von allem, was gegen die Uhr rechnet statt nur Stunden zu addieren — etwa „wie viel
 * vom Tag ist noch übrig". Bewusst hier und nicht als eigener Interval: zwei Takte, die sich um
 * Millisekunden verschieben, lassen benachbarte Zeilen unterschiedlich springen.
 *
 * Auf dem Server liefert der Store 0; dann gilt die Server-Zeit. Damit rendert die Seite mit einem
 * Wert, der stimmt, statt mit einem, der erst nach der Hydration stimmt.
 */
export function useNowMs(serverNowIso: string): number {
  const tick = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  return tick || new Date(serverNowIso).getTime();
}
