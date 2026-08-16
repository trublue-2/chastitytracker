"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Lock, LockOpen, Timer } from "lucide-react";
import { SessionEventData } from "./SessionEventRow";
import SessionTimeline from "./SessionTimeline";
import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { BLOCK_PAGE_SIZE } from "@/lib/constants";
import { toDateLocale } from "@/lib/utils";

interface OeffnenFooter {
  dateStr: string;
  timeStr: string;
  /** Already resolved via the data-owner's config (SessionList). null = kein Grund gesetzt. */
  grundLabel: string | null;
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
  sessionStartIso: string;
  sessionEndIso: string | null;
}


/** `tz` wird nur an `SessionTimeline` durchgereicht — Begründung dort. */
export default function SessionListClient({ sessions, tz }: { sessions: SessionListData[]; tz: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const dl = toDateLocale(locale);
  // Freeze "now" at mount: historical sessions don't care about live time, and
  // recomputing on every render invalidates SessionTimeline's useMemo.
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const { page, setPage, totalPages, visible } = usePagedList(sessions, BLOCK_PAGE_SIZE);

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
      {visible.map((session) => {
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

                  <SessionTimeline
                    tz={tz}
                    events={session.events}
                    sessionStart={session.sessionStartIso}
                    sessionEndIso={session.sessionEndIso ?? undefined}
                    nowIso={nowIso}
                    locale={dl}
                    mode="historical"
                    storageScope={`session-${session.id}`}
                  />

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
                        {session.oeffnen.grundLabel && (
                          <span className="text-xs font-semibold text-unlock-text bg-unlock-bg border border-unlock-border px-2 py-0.5 rounded-full">
                            {session.oeffnen.grundLabel}
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

      {/* Aufgeklappt wird per `openId`, also zeigt die neue Seite ohnehin nichts Offenes. Zurückblättern
          soll die Session aber ebenfalls zugeklappt zeigen — sonst springt das Panel wieder auf. */}
      <ListPager page={page} totalPages={totalPages} onPage={(p) => { setPage(p); setOpenId(null); }} />
    </div>
  );
}
