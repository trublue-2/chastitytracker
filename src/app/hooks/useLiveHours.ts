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
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  if (!active) return baseH;
  const serverNowMs = new Date(serverNowIso).getTime();
  const deltaH = (nowMs - serverNowMs) / 3_600_000;
  return baseH + deltaH;
}
