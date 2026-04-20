import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { computeLastReachedMilestone, computeNextMilestone } from "@/lib/milestones";

interface Props {
  sessionStart: Date;
  now: Date;
}

export default async function MilestoneHeroStrip({ sessionStart, now }: Props) {
  const t = await getTranslations("dashboard");
  const last = computeLastReachedMilestone(sessionStart, now);
  const next = computeNextMilestone(sessionStart, now);

  // Nothing to show: no milestone reached AND no next milestone (shouldn't happen with our list).
  if (!last && !next) return null;

  const msToNext = next ? Math.max(0, next.reachedAt.getTime() - now.getTime()) : 0;
  const daysToNext = Math.ceil(msToNext / 86_400_000);

  return (
    <div
      className="px-4 py-3 border-b border-border-subtle bg-background-subtle flex items-center justify-between gap-3"
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-lock-text min-w-0">
        <Star size={14} fill="currentColor" className="text-lock shrink-0" />
        <span className="truncate">
          {last
            ? <strong>{t("milestoneReached", { days: last.days })}</strong>
            : <span className="text-foreground-muted">{t("milestoneNoneYet")}</span>}
        </span>
      </div>
      {next && (
        <div className="text-xs text-foreground-muted text-right shrink-0">
          {t("milestoneNext", { days: next.days, inDays: daysToNext })}
        </div>
      )}
    </div>
  );
}
