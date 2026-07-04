import { Lock } from "lucide-react";
import { formatDateTime, formatDate, formatTime, hasExifMismatch, toDateLocale, isTimeCorrected, APP_TZ } from "@/lib/utils";
export type { SessionEvent } from "@/lib/sessionHelpers";
import { getTranslations, getLocale } from "next-intl/server";
import { getKombinierterPill } from "@/lib/kontrollePills";
import SessionDurationBadge from "./SessionDurationBadge";
import type { SessionEventData } from "./SessionEventRow";
import SessionTimeline from "./SessionTimeline";
import LiveTrainingGoals from "./LiveTrainingGoals";
import SperrzeitRemaining from "@/app/components/SperrzeitRemaining";

import type { SessionEvent } from "@/lib/sessionHelpers";

interface Props {
  sessionStart: Date;
  interruptionPausedMs?: number;
  now: Date;
  events: SessionEvent[];
  sperrzeitEndetAt: Date | null;
  sperrzeitUnbefristet?: boolean;
  sperrzeitNachricht?: string | null;
  /** Nur Keyholder-Sicht: geplante (noch nicht ausgelöste) Sperrzeit → Footer zeigt "geplant für"
   *  statt "gesperrt bis". Sub-Sichten setzen dies NIE (geplante bleiben für den Sub unsichtbar). */
  sperrzeitScheduledFor?: Date | null;
  activeVorgabe: {
    minProTagH: number | null;
    minProWocheH: number | null;
    minProMonatH: number | null;
    minProJahrH: number | null;
  } | null;
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

export default async function LaufendeSessionCard({
  sessionStart,
  interruptionPausedMs = 0,
  now,
  events,
  sperrzeitEndetAt,
  sperrzeitUnbefristet = false,
  sperrzeitNachricht,
  sperrzeitScheduledFor = null,
  activeVorgabe,
  tagH,
  wocheH,
  monatH,
  jahrH,
  tz = APP_TZ,
}: Props) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const ta = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());

  const sessionStartStr = formatDateTime(sessionStart, dl, tz);
  const sperrzeitStr = sperrzeitEndetAt ? formatDateTime(sperrzeitEndetAt, dl, tz) : null;
  const scheduledForStr = sperrzeitScheduledFor ? formatDateTime(sperrzeitScheduledFor, dl, tz) : null;
  const showSperrzeit = sperrzeitStr !== null || sperrzeitUnbefristet || scheduledForStr !== null;

  const hasVorgabe =
    activeVorgabe &&
    (activeVorgabe.minProTagH != null ||
      activeVorgabe.minProWocheH != null ||
      activeVorgabe.minProMonatH != null ||
      activeVorgabe.minProJahrH != null);

  return (
    <div className="bg-surface rounded-2xl overflow-hidden shadow-card border border-border">
      {/* ── Green status header ── */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-500 text-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 mt-0.5">
            <Lock size={24} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Mobile: stacked */}
            <div className="sm:hidden">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("sessionTitle")}</p>
              <p className="text-2xl font-bold leading-tight">{t("locked")}</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-60">{tCommon("duration")}:</span>
                <span className="text-xl font-bold tabular-nums">
                  <SessionDurationBadge since={sessionStart.toISOString()} pausedMs={interruptionPausedMs} />
                </span>
              </div>
            </div>
            {/* Desktop: side by side */}
            <div className="hidden sm:flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("sessionTitle")}</p>
                <p className="text-2xl font-bold">{t("locked")}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{tCommon("duration")}</p>
                <p className="text-3xl font-bold tabular-nums leading-tight">
                  <SessionDurationBadge since={sessionStart.toISOString()} pausedMs={interruptionPausedMs} />
                </p>
              </div>
            </div>
            <p className="text-xs opacity-60 mt-1">
              {t("sessionSince")} {sessionStartStr}
            </p>
          </div>
        </div>

        {/* Trainingsvorgaben – live-updating client component */}
        {hasVorgabe && (
          <LiveTrainingGoals
            serverNow={now.toISOString()}
            tagH={tagH}
            wocheH={wocheH}
            monatH={monatH}
            jahrH={jahrH}
            activeVorgabe={activeVorgabe}
          />
        )}
      </div>

      {/* ── Timeline (buckets + flat fallback for short sessions) ── */}
      <SessionTimeline
        events={events.map<SessionEventData>((ev) => {
          const dateStr = formatDate(ev.time, dl, tz);
          const timeStr = formatTime(ev.time, dl, tz);
          const exifStr = ev.imageExifTime && hasExifMismatch(ev.imageExifTime, ev.time)
            ? formatDateTime(ev.imageExifTime, dl, tz)
            : null;
          const kombiniertePill = getKombinierterPill(
            ev.kontrolleAnforderungStatus ?? null,
            ev.kontrolleVerifikationStatus ?? null,
            ta,
          );
          return {
            type: ev.type,
            timeIso: ev.time.toISOString(),
            dateStr,
            timeStr,
            imageUrl: ev.imageUrl,
            codeImageUrl: ev.codeImageUrl ?? null,
            exifStr,
            note: ev.note,
            entryId: ev.entryId,
            captureHref: !ev.entryId && ev.type === "kontrolle" && ev.kontrolleCode
              ? `/dashboard/new/pruefung?code=${ev.kontrolleCode}`
              : null,
            deadlineStr: ev.deadline ? formatDateTime(ev.deadline, dl, tz) : null,
            isOverdue: ev.kontrolleAnforderungStatus === "overdue",
            kontrolleCode: ev.kontrolleCode ?? null,
            kontrolleKommentar: ev.kontrolleKommentar ?? null,
            kombiniertePillLabel: kombiniertePill?.label ?? null,
            kombiniertePillCls: kombiniertePill?.cls ?? null,
            orgasmusArt: ev.orgasmusArt ?? null,
            pauseDurationStr: ev.pauseDurationStr ?? null,
            timeCorrected: isTimeCorrected(ev.time, ev.submittedAt),
            timeCorrectedSystemStr: isTimeCorrected(ev.time, ev.submittedAt)
              ? formatDateTime(ev.submittedAt!, dl, tz) : null,
          };
        })}
        sessionStart={sessionStart.toISOString()}
        nowIso={now.toISOString()}
        locale={dl}
        mode="active"
        storageScope="active"
      />

      {/* ── Sperrzeit footer ── */}
      {showSperrzeit && (
        <div className="bg-sperrzeit-bg border-t border-sperrzeit-border px-5 py-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-b-2xl">
          <Lock size={13} className="text-sperrzeit shrink-0" />
          <span className="text-sm font-semibold text-sperrzeit-text">
            {scheduledForStr
              ? <>{ta("scheduledForLabel")}: {scheduledForStr}</>
              : sperrzeitStr ? <>{t("sessionLockedUntil")} {sperrzeitStr}</> : t("sessionLockedIndefinite")}
          </span>
          {!scheduledForStr && sperrzeitEndetAt && (
            <SperrzeitRemaining
              endetAt={sperrzeitEndetAt.toISOString()}
              className="text-xs font-medium text-sperrzeit-text opacity-80"
            />
          )}
          {sperrzeitNachricht && (
            <span className="text-xs text-sperrzeit truncate">· {sperrzeitNachricht}</span>
          )}
        </div>
      )}
    </div>
  );
}
