"use client";

import { useEffect, useState } from "react";

/**
 * Forces a re-render every `intervalMs` milliseconds.
 * Used by live-updating time displays. Returns nothing — callers read
 * `Date.now()` or `new Date()` directly at render time.
 *
 * `intervalMs <= 0` schaltet den Takt ab, ohne dass der Aufrufer den Hook bedingt aufrufen müsste
 * (was React verbietet). Dafür gibt es einen Grund: ein abgelaufener Countdown zeigt einen festen
 * Text, tickte aber bis zum Unmount weiter — im Fall von `SperrzeitRemaining` sogar in eine
 * Komponente hinein, die nichts mehr rendert.
 */
export default function useTick(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
