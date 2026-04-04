"use client";

import { useCallback, useRef, useState } from "react";

const SWIPE_THRESHOLD = 60; // px to reveal actions
const VELOCITY_THRESHOLD = 0.3; // px/ms — fast swipes trigger at any distance

interface UseSwipeActionOptions {
  /** Maximum translateX distance in px (default: 80) */
  maxDistance?: number;
}

/**
 * useSwipeAction — horizontal swipe-to-reveal gesture for list items.
 *
 * Returns:
 * - offsetX: current horizontal offset (negative = swiped left)
 * - isRevealed: whether action buttons are fully visible
 * - handlers: touch event handlers to spread onto the element
 * - close: programmatically close the revealed state
 *
 * Usage:
 *   const { offsetX, isRevealed, handlers, close } = useSwipeAction();
 *   <div {...handlers} style={{ transform: `translateX(${offsetX}px)` }}>
 */
export default function useSwipeAction({ maxDistance = 80 }: UseSwipeActionOptions = {}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const isSwiping = useRef(false);
  const isVertical = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
    isSwiping.current = true;
    isVertical.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isSwiping.current) return;

      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // Determine scroll direction on first significant move
      if (!isVertical.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        isVertical.current = true;
        isSwiping.current = false;
        return;
      }

      // If already revealed: allow swiping back (right)
      if (isRevealed) {
        const newOffset = Math.max(-maxDistance, Math.min(0, dx));
        setOffsetX(newOffset);
        return;
      }

      // Only allow left swipe (negative dx)
      if (dx >= 0) {
        setOffsetX(0);
        return;
      }

      // Apply resistance past max distance
      const bounded = Math.max(-maxDistance * 1.2, dx * 0.8);
      setOffsetX(bounded);
    },
    [isRevealed, maxDistance]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping.current && !isRevealed) return;
    isSwiping.current = false;

    const elapsed = Date.now() - startTime.current;
    const velocity = Math.abs(offsetX) / Math.max(elapsed, 1);

    if (Math.abs(offsetX) >= SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      // Reveal actions
      setOffsetX(-maxDistance);
      setIsRevealed(true);
    } else {
      // Snap back
      setOffsetX(0);
      setIsRevealed(false);
    }
  }, [offsetX, maxDistance, isRevealed]);

  const close = useCallback(() => {
    setOffsetX(0);
    setIsRevealed(false);
  }, []);

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  return { offsetX, isRevealed, handlers, close };
}
