"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, LockOpen, Timer, CheckCircle2, Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import SessionEventRow, { SessionEventData } from "./SessionEventRow";

const GRUND_LABELS: Record<string, string> = {
  REINIGUNG: "Reinigung",
  KEYHOLDER: "Von Keyholder erlaubt",
  NOTFALL: "Notfall",
  ANDERES: "Anderes",
};

interface OeffnenFooter {
  dateStr: string;
  timeStr: string;
  grund: string | null;
  note: string | null;
}

export interface SessionListData {
  id: string;
  dateStr: string;
  timeStr: string;
  durationUnder24h: boolean;
  durationStr: string | null;
  active: boolean;
  thumbnailUrl: string | null;
  events: SessionEventData[];
  oeffnen: OeffnenFooter | null;
}

const PAGE_SIZE = 10;

export default function SessionListClient({ sessions }: { sessions: SessionListData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const t = useTranslations("dashboard");
  const totalPages = Math.ceil(sessions.length / PAGE_SIZE);
  const paginated = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Title */}
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t("sessions")}</p>
      </div>

      <div className="divide-y divide-gray-50">
      {sessions.length === 0 && (
        <div className="py-20 text-center text-gray-400 text-sm">{t("noEntries")}</div>
      )}
      {paginated.map((session) => {
        const isOpen = openId === session.id;
        return (
          <div key={session.id} className={isOpen ? "bg-gray-50" : undefined}>
            {/* ── Collapsed header ── */}
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : session.id)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-100/60 transition text-left"
            >
              {/* Von–Bis */}
              <div className="flex-1 min-w-0">
                {session.durationUnder24h ? (
                  <>
                    <span className="block text-sm font-semibold text-gray-900 tabular-nums">{session.dateStr}</span>
                    <span className="block text-xs text-gray-400 tabular-nums">{session.timeStr}{session.oeffnen ? ` – ${session.oeffnen.timeStr}` : ""}</span>
                  </>
                ) : session.oeffnen ? (
                  <>
                    <span className="block text-sm font-semibold text-gray-900 tabular-nums">{session.dateStr} – {session.oeffnen.dateStr}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm font-semibold text-gray-900 tabular-nums">{session.dateStr}</span>
                    <span className="block text-xs text-gray-400 tabular-nums">{session.timeStr}</span>
                  </>
                )}
              </div>

              {/* Duration / active badge + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                {session.active ? (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {t("stillLocked")}
                  </span>
                ) : session.durationStr ? (
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Timer size={10} />{session.durationStr}
                  </span>
                ) : null}
                {isOpen
                  ? <ChevronUp size={16} className="text-gray-400" />
                  : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </button>

            {/* ── Expanded content ── */}
            {isOpen && (
              <div className="px-2 pb-2">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Start marker */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                    <Lock size={11} className="text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Start</span>
                    <span className="text-xs text-emerald-500 tabular-nums">{session.dateStr}, {session.timeStr}</span>
                  </div>

                  <div className="divide-y divide-gray-50">
                    {session.events.map((ev, i) => {
                      const icon =
                        ev.type === "verschluss" ? <Lock size={18} className="text-emerald-500" /> :
                        ev.type === "kontrolle" ? <CheckCircle2 size={18} className="text-orange-400" /> :
                        <Droplets size={18} className="text-rose-400" />;
                      return <SessionEventRow key={i} ev={ev} icon={icon} />;
                    })}
                  </div>

                  {/* ── Öffnung footer (Ende) ── */}
                  {session.oeffnen ? (
                    <div className="border-t-2 border-gray-200 bg-gray-50">
                      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
                        <LockOpen size={11} className="text-gray-500 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Ende</span>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-700">
                          {session.oeffnen.dateStr}, {session.oeffnen.timeStr}
                        </span>
                        {session.oeffnen.grund && (
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            {GRUND_LABELS[session.oeffnen.grund] ?? session.oeffnen.grund}
                          </span>
                        )}
                        {session.oeffnen.note && (
                          <span className="text-xs text-gray-400 italic truncate">„{session.oeffnen.note}"</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-emerald-100 flex items-center gap-2 px-4 py-2 bg-emerald-50/60">
                      <Lock size={11} className="text-emerald-500 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">{t("stillLocked")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => { setPage(p => p - 1); setOpenId(null); }}
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
            onClick={() => { setPage(p => p + 1); setOpenId(null); }}
            disabled={page >= totalPages - 1}
            className="text-xs font-medium text-gray-500 disabled:text-gray-300 hover:text-gray-800 transition"
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}
