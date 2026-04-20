/**
 * Session-duration milestones (in days). Anything else lives in the hero strip
 * (next upcoming milestone) or as an inline marker between buckets (milestones
 * reached within that range).
 */
export const MILESTONE_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730] as const;

export type Milestone = {
  days: number;
  /** Time the milestone was reached (sessionStart + days). */
  reachedAt: Date;
};

export function computeReachedMilestones(sessionStart: Date, now: Date): Milestone[] {
  return MILESTONE_DAYS
    .map(days => ({ days, reachedAt: new Date(sessionStart.getTime() + days * 86_400_000) }))
    .filter(m => m.reachedAt.getTime() <= now.getTime());
}

export function computeNextMilestone(sessionStart: Date, now: Date): Milestone | null {
  for (const days of MILESTONE_DAYS) {
    const reachedAt = new Date(sessionStart.getTime() + days * 86_400_000);
    if (reachedAt.getTime() > now.getTime()) return { days, reachedAt };
  }
  return null;
}

export function computeLastReachedMilestone(sessionStart: Date, now: Date): Milestone | null {
  const reached = computeReachedMilestones(sessionStart, now);
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

/**
 * Returns milestones whose reach-time falls strictly within (rangeStart, rangeEnd].
 * Used to render inline markers between buckets.
 */
export function milestonesInRange(
  sessionStart: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Milestone[] {
  return computeReachedMilestones(sessionStart, rangeEnd).filter(
    m => m.reachedAt.getTime() > rangeStart.getTime() && m.reachedAt.getTime() <= rangeEnd.getTime(),
  );
}
