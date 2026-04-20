"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronRight, Lock, CheckCircle2, Droplets, LockOpen, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import SessionEventRow, { type SessionEventData } from "./SessionEventRow";
import {
  groupEventsIntoBuckets,
  shouldRenderBucketHeaders,
  historicalSessionNeedsBuckets,
  type TimelineBucket,
} from "@/lib/timelineBuckets";
import { milestonesInRange } from "@/lib/milestones";

interface Props {
  events: SessionEventData[];
  /** Session start — required for milestone inline-marker computation in the active range. */
  sessionStart: string; // ISO
  /** Used to compute bucket ranges relative to "now" in the active mode. */
  nowIso: string;
  locale: string;
  mode: "active" | "historical";
  /** Historical sessions need an end time to decide if bucketing should kick in. */
  sessionEndIso?: string;
  /** Stable per-session prefix for localStorage keys (so buckets remember state per session). */
  storageScope: string;
}

function iconFor(type: SessionEventData["type"]) {
  return type === "verschluss" ? <Lock size={18} className="text-lock" /> :
    type === "kontrolle" ? <CheckCircle2 size={18} className="text-[var(--color-inspect)]" /> :
    type === "reinigung" ? <LockOpen size={18} className="text-[var(--color-unlock)]" /> :
    <Droplets size={18} className="text-[var(--color-orgasm)]" />;
}

function FlatEvents({ items }: { items: SessionEventData[] }) {
  return (
    <div className="divide-y divide-border-subtle">
      {items.map((ev, i) => (
        <SessionEventRow key={i} ev={ev} icon={iconFor(ev.type)} />
      ))}
    </div>
  );
}

function MilestoneInlineMarker({ days }: { days: number }) {
  const t = useTranslations("dashboard");
  return (
    <div
      role="separator"
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle bg-lock-bg"
    >
      <div className="flex-1 h-px bg-lock-border" />
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-lock-text">
        <Star size={12} fill="currentColor" className="text-lock" />
        {t("milestoneReached", { days })}
      </span>
      <div className="flex-1 h-px bg-lock-border" />
    </div>
  );
}

function BucketSection({
  bucket,
  storageKey,
  titleLabel,
  sessionStartMs,
}: {
  bucket: TimelineBucket;
  storageKey: string;
  titleLabel: string;
  sessionStartMs: number;
}) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(bucket.defaultExpanded);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "open") setExpanded(true);
      else if (stored === "closed") setExpanded(false);
    } catch { /* ignore */ }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? "open" : "closed"); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  const panelId = `bucket-panel-${bucket.id}`;
  const summaryParts: string[] = [];
  if (bucket.counts.kontrolle > 0) summaryParts.push(t("summaryKontrollen", { n: bucket.counts.kontrolle }));
  if (bucket.counts.reinigung > 0) summaryParts.push(t("summaryReinigungen", { n: bucket.counts.reinigung }));
  if (bucket.counts.orgasmus > 0) summaryParts.push(t("summaryOrgasmen", { n: bucket.counts.orgasmus }));
  if (bucket.counts.verschluss > 0) summaryParts.push(t("summaryVerschlusse", { n: bucket.counts.verschluss }));

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-5 py-3 min-h-[48px] hover:bg-surface-raised transition text-left border-b border-border-subtle"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{titleLabel}</span>
            {bucket.dateRangeLabel && (
              <span className="text-xs text-foreground-faint tabular-nums">· {bucket.dateRangeLabel}</span>
            )}
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-surface-raised border border-border text-foreground-muted tabular-nums">
              {bucket.counts.total}
            </span>
          </div>
          {!expanded && summaryParts.length > 0 && (
            <div className="text-xs text-foreground-muted mt-0.5 truncate">{summaryParts.join(" · ")}</div>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-foreground-faint transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div id={panelId}>
          <FlatEvents items={bucket.items} />
        </div>
      )}
      {milestonesInRange(new Date(sessionStartMs), bucket.rangeStart, bucket.rangeEnd).map(m => (
        <MilestoneInlineMarker key={`m-${bucket.id}-${m.days}`} days={m.days} />
      ))}
    </div>
  );
}

export default function SessionTimeline({
  events,
  sessionStart,
  nowIso,
  locale,
  mode,
  sessionEndIso,
  storageScope,
}: Props) {
  const t = useTranslations("dashboard");
  const sessionStartMs = new Date(sessionStart).getTime();

  // Attach raw _time for grouping (falls back to sessionStart if timeIso missing; shouldn't happen).
  const withTime = useMemo(() => events.map(ev => Object.assign(
    { ...ev },
    { _time: ev.timeIso ? new Date(ev.timeIso) : new Date(sessionStart) },
  )), [events, sessionStart]);

  // Historical: if the session span is <14 days, render flat (like active-mode short sessions).
  if (mode === "historical") {
    const end = sessionEndIso ? new Date(sessionEndIso) : new Date(nowIso);
    if (!historicalSessionNeedsBuckets(new Date(sessionStart), end)) {
      return <FlatEvents items={events} />;
    }
  }

  const buckets = groupEventsIntoBuckets(withTime, new Date(nowIso), locale, mode);
  const renderHeaders = mode === "active" ? shouldRenderBucketHeaders(buckets) : buckets.length > 0;

  // Active mode, fresh session → flat rendering keeps UI identical to pre-feature state.
  if (!renderHeaders) {
    return <FlatEvents items={events} />;
  }

  const titleFor = (b: TimelineBucket): string => {
    if (b.kind === "today") return t("bucketToday");
    if (b.kind === "yesterday") return t("bucketYesterday");
    if (b.kind === "thisWeek") return t("bucketThisWeek");
    if (b.kind === "lastWeek") return t("bucketLastWeek");
    if (b.kind === "week") return t("bucketWeekOf", { date: b.absoluteLabel ?? "" });
    return b.absoluteLabel ?? "";
  };

  return (
    <div>
      {buckets.map(b => (
        <BucketSection
          key={b.id}
          bucket={b}
          storageKey={`timeline-bucket-${storageScope}-${b.id}`}
          titleLabel={titleFor(b)}
          sessionStartMs={sessionStartMs}
        />
      ))}
    </div>
  );
}
