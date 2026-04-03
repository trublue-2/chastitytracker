import { Lock, LockOpen, ClipboardCheck, Droplets, PauseCircle } from "lucide-react";
import Badge from "./Badge";
import ImageViewer from "./ImageViewer";

type EventType = "VERSCHLUSS" | "OEFFNEN" | "PRUEFUNG" | "ORGASMUS" | "REINIGUNG";

interface TimelineEvent {
  id: string;
  type: EventType;
  time: Date | string;
  label?: string;
  note?: string;
  imageUrl?: string | null;
}

interface SessionTimelineProps {
  events: TimelineEvent[];
  isActive?: boolean;
  className?: string;
}

const eventConfig: Record<EventType, {
  icon: typeof Lock;
  color: string;
  dotColor: string;
  badgeVariant: "lock" | "unlock" | "inspect" | "orgasm" | "neutral";
  label: string;
}> = {
  VERSCHLUSS: { icon: Lock, color: "text-lock", dotColor: "bg-lock", badgeVariant: "lock", label: "Verschluss" },
  OEFFNEN:    { icon: LockOpen, color: "text-unlock", dotColor: "bg-unlock", badgeVariant: "unlock", label: "Oeffnen" },
  PRUEFUNG:   { icon: ClipboardCheck, color: "text-inspect", dotColor: "bg-inspect", badgeVariant: "inspect", label: "Pruefung" },
  ORGASMUS:   { icon: Droplets, color: "text-orgasm", dotColor: "bg-orgasm", badgeVariant: "orgasm", label: "Orgasmus" },
  REINIGUNG:  { icon: PauseCircle, color: "text-foreground-faint", dotColor: "bg-foreground-faint", badgeVariant: "neutral", label: "Reinigung" },
};

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionTimeline({
  events,
  isActive = false,
  className = "",
}: SessionTimelineProps) {
  // Sort descending (newest first)
  const sorted = [...events].sort((a, b) => {
    const ta = typeof a.time === "string" ? new Date(a.time).getTime() : a.time.getTime();
    const tb = typeof b.time === "string" ? new Date(b.time).getTime() : b.time.getTime();
    return tb - ta;
  });

  return (
    <div className={`relative ${className}`}>
      {/* Vertical line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-border-subtle" aria-hidden="true" />

      <div className="space-y-4">
        {sorted.map((event, idx) => {
          const config = eventConfig[event.type];
          const Icon = config.icon;
          const isFirst = idx === 0;

          return (
            <div key={event.id} className="relative flex items-start gap-3 pl-0">
              {/* Dot on the timeline */}
              <div className="relative z-10 mt-1.5 shrink-0">
                <div
                  className={[
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    config.dotColor,
                    isFirst && isActive ? "ring-2 ring-offset-2 ring-offset-surface ring-lock" : "",
                  ].join(" ")}
                >
                  <Icon size={14} className="text-white" strokeWidth={2.5} />
                </div>
              </div>

              {/* Thumbnail */}
              {event.imageUrl && (
                <div className="shrink-0">
                  <ImageViewer
                    src={event.imageUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={config.badgeVariant}
                    size="sm"
                    label={event.label ?? config.label}
                  />
                  <span className="text-xs text-foreground-faint tabular-nums">
                    {formatTime(event.time)}
                  </span>
                </div>
                {event.note && (
                  <p className="text-sm text-foreground-muted mt-0.5 truncate">
                    {event.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
