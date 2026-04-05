"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, LockOpen, Timer, CheckCircle2, Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import SessionEventRow, { SessionEventData } from "./SessionEventRow";
import { GRUND_I18N_KEYS } from "@/lib/constants";

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
  startAbbrevStr: string | null;
}

const PAGE_SIZE = 10;

export default function SessionListClient({ sessions }: { sessions: SessionListData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tOpen = useTranslations("openForm");
  const totalPages = Math.ceil(sessions.length / PAGE_SIZE);
  const paginated = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      {/* Title */}
      <div className="px-5 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sessions")}</p>
      </div>

      <div className="divide-y divide-border-subtle">
      {sessions.length === 0 && (
        <div className="py-20 text-center text-foreground-faint text-sm">{t("noEntries")}</div>
      )}
      {paginated.map((session) => {
        const isOpen = openId === session.id;
        return (
          <div key={session.id} className={isOpen ? "bg-surface-raised" : undefined}>
            {/* ── Collapsed header ── */}
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : session.id)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-raised transition text-left"
            >
              {/* Von–Bis */}
              <div className="flex-1 min-w-0">
                {session.durationUnder24h ? (
                  <>
                    <span className="block text-sm font-semibold text-foreground tabular-nums">{session.dateStr}</span>
                    <span className="block text-xs text-foreground-faint tabular-nums">{session.timeStr}{session.oeffnen ? ` – ${session.oeffnen.timeStr}` : ""}</span>
                  </>
                ) : session.oeffnen ? (
                  <>
                    <span className="block text-sm font-semibold text-foreground tabular-nums">{session.startAbbrevStr ?? session.dateStr} – {session.oeffnen.dateStr}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm font-semibold text-foreground tabular-nums">{session.dateStr}</span>
                    <span className="block text-xs text-foreground-faint tabular-nums">{session.timeStr}</span>
                  </>
                )}
              </div>

              {/* Duration / active badge + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                {session.active ? (
                  <span className="text-xs font-semibold text-lock-text bg-lock-bg border border-lock-border px-2 py-0.5 rounded-full">
                    {t("stillLocked")}
                  </span>
                ) : session.durationStr ? (
                  <span className="text-xs font-mono text-foreground-muted bg-surface-raised border border-border px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Timer size={10} />{session.durationStr}
                  </span>
                ) : null}
                {isOpen
                  ? <ChevronUp size={16} className="text-foreground-faint" />
                  : <ChevronDown size={16} className="text-foreground-faint" />}
              </div>
            </button>

            {/* ── Expanded content ── */}
            {isOpen && (
              <div className="px-2 pb-2">
                <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
                  {/* Start marker */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-lock-bg border-b border-lock-border">
                    <Lock size={11} className="text-lock shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-lock">{t("sessionStart")}</span>
                    <span className="text-xs text-lock tabular-nums opacity-70">{session.dateStr}, {session.timeStr}</span>
                  </div>

                  <div className="divide-y divide-border-subtle">
                    {session.events.map((ev, i) => {
                      const icon =
                        ev.type === "verschluss" ? <Lock size={18} className="text-lock" /> :
                        ev.type === "kontrolle" ? <CheckCircle2 size={18} className="text-[var(--color-inspect)]" /> :
                        <Droplets size={18} className="text-[var(--color-orgasm)]" />;
                      return <SessionEventRow key={i} ev={ev} icon={icon} />;
                    })}
                  </div>

                  {/* ── Öffnung footer (Ende) ── */}
                  {session.oeffnen ? (
                    <div className="border-t-2 border-border bg-surface-raised">
                      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
                        <LockOpen size={11} className="text-foreground-faint shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground-faint">{t("sessionEnd")}</span>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground-muted">
                          {session.oeffnen.dateStr}, {session.oeffnen.timeStr}
                        </span>
                        {session.oeffnen.grund && (
                          <span className="text-xs font-semibold text-unlock-text bg-unlock-bg border border-unlock-border px-2 py-0.5 rounded-full">
                            {GRUND_I18N_KEYS[session.oeffnen.grund as keyof typeof GRUND_I18N_KEYS]
                              ? tOpen(GRUND_I18N_KEYS[session.oeffnen.grund as keyof typeof GRUND_I18N_KEYS])
                              : session.oeffnen.grund}
                          </span>
                        )}
                        {session.oeffnen.note && (
                          <span className="text-xs text-foreground-faint italic truncate">„{session.oeffnen.note}"</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-lock-border flex items-center gap-2 px-4 py-2 bg-lock-bg">
                      <Lock size={11} className="text-lock shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider text-lock">{t("stillLocked")}</span>
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => { setPage(p => p - 1); setOpenId(null); }}
            disabled={page === 0}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition"
          >
            ← {tCommon("previous")}
          </button>
          <span className="text-xs text-foreground-faint tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => { setPage(p => p + 1); setOpenId(null); }}
            disabled={page >= totalPages - 1}
            className="text-xs font-medium text-foreground-muted disabled:text-foreground-faint hover:text-foreground transition"
          >
            {tCommon("next")} →
          </button>
        </div>
      )}
    </div>
  );
}
