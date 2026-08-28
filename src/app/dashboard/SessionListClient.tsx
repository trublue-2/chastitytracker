"use client";

import Section from "@/app/components/Section";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Timer } from "lucide-react";
import { SessionEventData } from "./SessionEventRow";
import SessionTimeline from "./SessionTimeline";
import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { BLOCK_PAGE_SIZE } from "@/lib/constants";
import { toDateLocale } from "@/lib/utils";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

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
export default function SessionListClient({ sessions, tz, defaultCollapsed }: { sessions: SessionListData[]; tz: string; defaultCollapsed?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const dl = toDateLocale(locale);
  // Freeze "now" at mount: historical sessions don't care about live time, and
  // recomputing on every render invalidates SessionTimeline's useMemo.
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const { page, setPage, totalPages, visible } = usePagedList(sessions, BLOCK_PAGE_SIZE);

  return (
    <Section title={t("sessions")} defaultCollapsed={defaultCollapsed}>
      <div className="divide-y divide-border-subtle">
      {sessions.length === 0 && (
        <div className="py-16 text-center text-foreground-faint text-fliess">{t("noEntries")}</div>
      )}
      {visible.map((session) => {
        const isOpen = openId === session.id;
        return (
          <div key={session.id}>
            {/* ── Zugeklappte Kopfzeile ── */}
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : session.id)}
              className="w-full flex items-center gap-3 px-1 py-3 text-left"
            >
              {/* Von–Bis */}
              <div className="flex-1 min-w-0">
                {session.durationUnder24h ? (
                  <>
                    <span className="block text-fliess text-foreground tabular-nums">{session.dateStr}</span>
                    <span className="block text-neben text-foreground-faint tabular-nums">{session.timeStr}{session.oeffnen ? ` – ${session.oeffnen.timeStr}` : ""}</span>
                  </>
                ) : session.oeffnen ? (
                  <span className="block text-fliess text-foreground tabular-nums">{session.startAbbrevStr ?? session.dateStr} – {session.oeffnen.dateStr}</span>
                ) : (
                  <>
                    <span className="block text-fliess text-foreground tabular-nums">{session.dateStr}</span>
                    <span className="block text-neben text-foreground-faint tabular-nums">{session.timeStr}</span>
                  </>
                )}
              </div>

              {/* Dauer bzw. laufender Zustand. Ohne Pillen-Rahmen: die Dauer ist eine Angabe wie
                  jede andere in der Zeile, und ein Rahmen um zwei Wörter ist der kleinste Kasten
                  der App. Farbe trägt nur der Zustand, der JETZT gilt — „noch verschlossen". */}
              <div className="flex items-center gap-2 shrink-0">
                {session.active ? (
                  <span className="text-neben font-semibold text-lock">{t("stillLocked")}</span>
                ) : session.durationStr ? (
                  <span className="text-neben text-foreground-muted tabular-nums flex items-center gap-1">
                    <Timer size={11} />{session.durationStr}
                  </span>
                ) : null}
                {isOpen
                  ? <ChevronUp size={16} className="text-foreground-faint" />
                  : <ChevronDown size={16} className="text-foreground-faint" />}
              </div>
            </button>

            {/* ── Aufgeklappter Inhalt ──
                Kein Kasten mit Schatten mehr um die Zeitleiste und keine getönten Streifen um
                Anfang und Ende. Der aufgeklappte Bereich ist eingerückt und leicht abgesetzt —
                das sagt „gehört zur Zeile darüber" so gut wie ein Rahmen, ohne die dritte
                Einzäunung auf demselben Bildschirm. */}
            {isOpen && (
              <div className="pl-4 pb-4 border-l-2 border-border-subtle ml-1">
                <SessionMarker icon={<LockClosedIcon size={11} />} label={t("sessionStart")} tone="lock">
                  {session.dateStr}, {session.timeStr}
                </SessionMarker>

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

                {session.oeffnen ? (
                  <SessionMarker icon={<LockOpenIcon size={11} />} label={t("sessionEnd")}>
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="tabular-nums">{session.oeffnen.dateStr}, {session.oeffnen.timeStr}</span>
                      {session.oeffnen.grundLabel && <span>{session.oeffnen.grundLabel}</span>}
                      {session.oeffnen.note && <span className="italic truncate">„{session.oeffnen.note}"</span>}
                    </span>
                  </SessionMarker>
                ) : (
                  <SessionMarker icon={<LockClosedIcon size={11} />} label={t("stillLocked")} tone="lock" />
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* Aufgeklappt wird per `openId`, also zeigt die neue Seite ohnehin nichts Offenes. Zurückblättern
          soll die Session aber ebenfalls zugeklappt zeigen — sonst springt das Panel wieder auf. */}
      <ListPager page={page} totalPages={totalPages} onPage={(p) => { setPage(p); setOpenId(null); }} />
    </Section>
  );
}

/**
 * Anfang und Ende einer Session in der aufgeklappten Ansicht — eine Rubrik-Zeile mit Zeichen und
 * optionaler Angabe dahinter.
 *
 * Beide standen vorher als getönter Streifen mit eigener Trennlinie da, dreimal fast gleich
 * geschrieben. Ein Streifen für „hier fängt es an" ist eine Beschriftung mit Hintergrund — die
 * Beschriftung allein sagt dasselbe.
 */
function SessionMarker({ icon, label, tone, children }: {
  icon: React.ReactNode;
  label: string;
  /** `lock` färbt die Rubrik in den Zustands-Ton — nur für den Zustand, der noch gilt. */
  tone?: "lock";
  children?: React.ReactNode;
}) {
  const color = tone === "lock" ? "text-lock" : "text-foreground-faint";
  return (
    <div className="flex items-baseline gap-2 py-2 flex-wrap">
      <span className={`flex items-center gap-1.5 text-rubrik font-semibold uppercase tracking-wider shrink-0 ${color}`}>
        {icon}{label}
      </span>
      {children && <span className="text-neben text-foreground-muted min-w-0">{children}</span>}
    </div>
  );
}
