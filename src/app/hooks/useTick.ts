"use client";

import { useEffect, useState } from "react";

/**
 * Forces a re-render every `intervalMs` milliseconds.
 * Used by live-updating time displays. Returns nothing — callers read
 * `Date.now()` or `new Date()` directly at render time.
 */
export default function useTick(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
