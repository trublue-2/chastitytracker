"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 80; // px to trigger refresh
const MAX_PULL = 120; // maximum visual pull distance

interface UsePullToRefreshOptions {
  /** Called when the user completes a pull-to-refresh gesture */
  onRefresh: () => Promise<void>;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
}

/**
 * usePullToRefresh — touch-based pull-to-refresh gesture for mobile PWA.
 *
 * Returns:
 * - pullDistance: current pull distance (0 = idle)
 * - isRefreshing: true while onRefresh is running
 * - containerRef: attach to the scrollable container
 *
 * Activates only when scrollTop === 0 and pulling down.
 * Use with overscroll-behavior-y: contain to prevent Chrome's native PTR.
 */
export default function usePullToRefresh({ onRefresh, enabled = true }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshing) return;
      const el = containerRef.current;
      if (!el) return;

      // Only activate at scroll top
      if (el.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    },
    [enabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff < 0) {
        // Scrolling up — not a pull gesture
        isPulling.current = false;
        setPullDistance(0);
        return;
      }

      // Apply resistance: distance follows a decelerating curve
      const resistance = Math.min(diff * 0.5, MAX_PULL);
      setPullDistance(resistance);

      // Prevent default scroll while pulling
      if (resistance > 10) {
        e.preventDefault();
      }
    },
    [isRefreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD * 0.5); // Settle to smaller height while refreshing
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing, containerRef };
}
