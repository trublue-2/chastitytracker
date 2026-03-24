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
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50">
        <p className="text-sm font-bold text-gray-900">{title}</p>
      </div>
      <div className="divide-y divide-gray-50">
        {paginated.map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-center gap-3">
            <span className={`flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0 ${e.typeColor}`}>
              {ICONS[e.typeIcon]}{e.typeLabel}
            </span>
            <span className="text-sm text-gray-900 tabular-nums">{e.dateTimeStr}</span>
            {e.pillLabel && (
              <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 flex-shrink-0 ${e.pillCls}`}>
                {e.pillLabel}
              </span>
            )}
            {e.note && <span className="text-xs text-gray-400 italic truncate min-w-0">„{e.note}"</span>}
            {e.orgasmusArt && <span className="text-xs text-rose-400 font-medium">{e.orgasmusArt}</span>}
            <div className="ml-auto flex-shrink-0">
              <EntryActions id={e.id} editHref={e.editHref} />
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setPage(p => p - 1)}
            disabled={page === 0}
            className="text-xs font-medium text-gray-500 disabled:text-gray-300 hover:text-gray-800 transition"
          >
            ← Zurück
          </button>
          <span className="text-xs text-gray-400 tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages - 1}
            className="text-xs font-medium text-gray-500 disabled:text-gray-300 hover:text-gray-800 transition"
          >
            Weiter →
          </button>
        </div>
      )}
    </section>
  );
}
