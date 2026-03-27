"use client";

import { useState } from "react";
import { Lock, LockOpen, ClipboardList, Droplets } from "lucide-react";
import EntryActions from "@/app/dashboard/EntryActions";

export interface AllEntryData {
  id: string;
  type: string;
  dateTimeStr: string;
  typeLabel: string;
  typeColor: string;
  typeIcon: "lock" | "lockopen" | "clipboard" | "droplets";
  pillLabel: string | null;
  pillCls: string | null;
  note: string | null;
  orgasmusArt: string | null;
  editHref: string;
}

const PAGE_SIZE = 10;

const ICONS = {
  lock:      <Lock size={12} />,
  lockopen:  <LockOpen size={12} />,
  clipboard: <ClipboardList size={12} />,
  droplets:  <Droplets size={12} />,
};

export default function AllEntriesClient({ entries, title }: { entries: AllEntryData[]; title: string }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const paginated = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle">
        <p className="text-sm font-bold text-foreground">{title}</p>
      </div>
      <div className="divide-y divide-border-subtle">
        {paginated.map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-center gap-3">
            <span className={`flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0 ${e.typeColor}`}>
              {ICONS[e.typeIcon]}{e.typeLabel}
            </span>
            <span className="text-sm text-foreground tabular-nums">{e.dateTimeStr}</span>
            {e.pillLabel && (
              <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${e.pillCls}`}>
                {e.pillLabel}
              </span>
            )}
            {e.note && <span className="text-xs text-foreground-faint italic truncate min-w-0">„{e.note}"</span>}
            {e.orgasmusArt && <span className="text-xs text-[var(--color-orgasm)] font-medium">{e.orgasmusArt}</span>}
            <div className="ml-auto flex-shrink-0">
              <EntryActions id={e.id} editHref={e.editHref} />
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={() => setPage(p => p - 1)}
            disabled={page === 0}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition"
          >
            ← Zurück
          </button>
          <span className="text-xs text-foreground-faint tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages - 1}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition"
          >
            Weiter →
          </button>
        </div>
      )}
    </section>
  );
}
