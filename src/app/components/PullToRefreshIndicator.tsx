"use client";

import { Loader2, ArrowDown } from "lucide-react";

const PULL_THRESHOLD = 80;

interface Props {
  pullDistance: number;
  isRefreshing: boolean;
}

/**
 * PullToRefreshIndicator — visual feedback for pull-to-refresh gesture.
 * Shows an arrow when pulling, spinner when refreshing.
 * Renders above the content area.
 */
export default function PullToRefreshIndicator({ pullDistance, isRefreshing }: Props) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const rotation = progress * 180; // Arrow rotates to point up when threshold reached

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-fast"
      style={{ height: pullDistance }}
    >
      {isRefreshing ? (
        <Loader2 size={24} className="text-lock animate-spin" />
      ) : (
        <ArrowDown
          size={24}
          className="text-foreground-muted transition-transform duration-fast"
          style={{ transform: `rotate(${rotation}deg)`, opacity: progress }}
        />
      )}
    </div>
  );
}
