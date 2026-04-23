"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronRight, Lock, CheckCircle2, Droplets, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import SessionEventRow, { type SessionEventData } from "./SessionEventRow";
import {
  groupEventsIntoBuckets,
  shouldRenderBucketHeaders,
  historicalSessionNeedsBuckets,
  type TimelineBucket,
} from "@/lib/timelineBuckets";

interface Props {
  events: SessionEventData[];
  /** Session start — used as fallback for events without timeIso during bucket grouping. */
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

function BucketSection({
  bucket,
  storageKey,
  titleLabel,
}: {
  bucket: TimelineBucket;
  storageKey: string;
  titleLabel: string;
}) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(bucket.defaultExpanded);

  // Read persisted state after hydration. Using useState+useEffect (instead of
  // a lazy initializer) avoids SSR/CSR hydration mismatch — the server can't
  // see localStorage. Guard avoids a redundant re-render when stored matches
  // defaultExpanded.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "open" && !bucket.defaultExpanded) setExpanded(true);
      else if (stored === "closed" && bucket.defaultExpanded) setExpanded(false);
    } catch { /* ignore */ }
  }, [storageKey, bucket.defaultExpanded]);

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
        className="relative w-full block px-5 py-3 pr-16 min-h-[48px] hover:bg-surface-raised transition text-left border-b border-border-subtle"
      >
        <div className="flex items-center gap-2 h-6">
          <span className="font-semibold text-sm text-foreground leading-none">{titleLabel}</span>
          {bucket.dateRangeLabel && (
            <span className="text-xs text-foreground-faint tabular-nums leading-none">· {bucket.dateRangeLabel}</span>
          )}
        </div>
        {!expanded && summaryParts.length > 0 && (
          <div className="text-xs text-foreground-muted mt-1 truncate pr-2">{summaryParts.join(" · ")}</div>
        )}
        <span className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <span className="flex items-center justify-center h-6 min-w-6 text-xs px-2 rounded-full bg-surface-raised border border-border text-foreground-muted tabular-nums leading-none">
            {bucket.counts.total}
          </span>
          <ChevronRight
            size={16}
            className={`text-foreground-faint transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          />
        </span>
      </button>
      {expanded && (
        <div id={panelId}>
          <FlatEvents items={bucket.items} />
        </div>
      )}
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

  const buckets = useMemo(() => {
    const withTime = events.map(ev => ({
      ...ev,
      _time: ev.timeIso ? new Date(ev.timeIso) : new Date(sessionStart),
    }));
    return groupEventsIntoBuckets(withTime, new Date(nowIso), locale, mode);
  }, [events, sessionStart, nowIso, locale, mode]);

  // Historical: session span <14 days → render flat (like active-mode fresh sessions).
  if (mode === "historical") {
    const end = sessionEndIso ? new Date(sessionEndIso) : new Date(nowIso);
    if (!historicalSessionNeedsBuckets(new Date(sessionStart), end)) {
      return <FlatEvents items={events} />;
    }
  }

  const renderHeaders = mode === "active" ? shouldRenderBucketHeaders(buckets) : buckets.length > 0;
  if (!renderHeaders) return <FlatEvents items={events} />;

  const titleFor = (b: TimelineBucket): string => {
    switch (b.kind) {
      case "today":     return t("bucketToday");
      case "yesterday": return t("bucketYesterday");
      case "thisWeek":  return t("bucketThisWeek");
      case "lastWeek":  return t("bucketLastWeek");
      case "week":      return t("bucketWeekOf", { date: b.absoluteLabel ?? "" });
      case "month":     return b.absoluteLabel ?? "";
    }
  };

  return (
    <div>
      {buckets.map(b => (
        <BucketSection
          key={b.id}
          bucket={b}
          storageKey={`timeline-bucket-${storageScope}-${b.id}`}
          titleLabel={titleFor(b)}
        />
      ))}
    </div>
  );
}
