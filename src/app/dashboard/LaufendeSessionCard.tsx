import { Lock, LockOpen, CheckCircle2, Droplets } from "lucide-react";
import { formatHours, formatDateTime, formatDate, formatTime, hasExifMismatch, toDateLocale, isTimeCorrected } from "@/lib/utils";
export type { SessionEvent } from "@/lib/sessionHelpers";
import { getTranslations, getLocale } from "next-intl/server";
import { getKombinierterPill } from "@/lib/kontrollePills";
import SessionDurationBadge from "./SessionDurationBadge";
import SessionEventRow from "./SessionEventRow";
import LiveTrainingGoals from "./LiveTrainingGoals";

import type { SessionEvent } from "@/lib/sessionHelpers";

interface Props {
  sessionStart: Date;
  interruptionPausedMs?: number;
  now: Date;
  events: SessionEvent[];
  sperrzeitEndetAt: Date | null;
  sperrzeitUnbefristet?: boolean;
  sperrzeitNachricht?: string | null;
  activeVorgabe: {
    minProTagH: number | null;
    minProWocheH: number | null;
    minProMonatH: number | null;
  } | null;
  tagH: number;
  wocheH: number;
  monatH: number;
}

export default async function LaufendeSessionCard({
  sessionStart,
  interruptionPausedMs = 0,
  now,
  events,
  sperrzeitEndetAt,
  sperrzeitUnbefristet = false,
  sperrzeitNachricht,
  activeVorgabe,
  tagH,
  wocheH,
  monatH,
}: Props) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const ta = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());

  const sessionStartStr = formatDateTime(sessionStart, dl);
  const sperrzeitStr = sperrzeitEndetAt ? formatDateTime(sperrzeitEndetAt, dl) : null;
  const showSperrzeit = sperrzeitStr !== null || sperrzeitUnbefristet;

  const hasVorgabe =
    activeVorgabe &&
    (activeVorgabe.minProTagH != null ||
      activeVorgabe.minProWocheH != null ||
      activeVorgabe.minProMonatH != null);

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
            activeVorgabe={activeVorgabe}
          />
        )}
      </div>

      {/* ── Timeline ── */}
      <div className="divide-y divide-border-subtle">
        {events.map((ev, i) => {
          const dateStr = formatDate(ev.time, dl);
          const timeStr = formatTime(ev.time, dl);
          const exifStr = ev.imageExifTime && hasExifMismatch(ev.imageExifTime, ev.time)
            ? formatDateTime(ev.imageExifTime, dl)
            : null;
          const kombiniertePill = getKombinierterPill(
            ev.kontrolleAnforderungStatus ?? null,
            ev.kontrolleVerifikationStatus ?? null,
            ta,
          );
          const icon =
            ev.type === "verschluss" ? <Lock size={18} className="text-lock" /> :
            ev.type === "kontrolle" ? <CheckCircle2 size={18} className="text-[var(--color-inspect)]" /> :
            ev.type === "reinigung" ? <LockOpen size={18} className="text-[var(--color-unlock)]" /> :
            <Droplets size={18} className="text-[var(--color-orgasm)]" />;

          return (
            <SessionEventRow
              key={i}
              icon={icon}
              ev={{
                type: ev.type,
                dateStr,
                timeStr,
                imageUrl: ev.imageUrl,
                exifStr,
                note: ev.note,
                entryId: ev.entryId,
                captureHref: !ev.entryId && ev.type === "kontrolle" && ev.kontrolleCode
                  ? `/dashboard/new/pruefung?code=${ev.kontrolleCode}`
                  : null,
                deadlineStr: ev.deadline ? formatDateTime(ev.deadline, dl) : null,
                isOverdue: ev.kontrolleAnforderungStatus === "overdue",
                kontrolleCode: ev.kontrolleCode ?? null,
                kontrolleKommentar: ev.kontrolleKommentar ?? null,
                kombiniertePillLabel: kombiniertePill?.label ?? null,
                kombiniertePillCls: kombiniertePill?.cls ?? null,
                orgasmusArt: ev.orgasmusArt ?? null,
                pauseDurationStr: ev.pauseDurationStr ?? null,
                timeCorrected: isTimeCorrected(ev.time, ev.submittedAt),
                timeCorrectedSystemStr: isTimeCorrected(ev.time, ev.submittedAt)
                  ? formatDateTime(ev.submittedAt!, dl) : null,
              }}
            />
          );
        })}
      </div>

      {/* ── Sperrzeit footer ── */}
      {showSperrzeit && (
        <div className="bg-sperrzeit-bg border-t border-sperrzeit-border px-5 py-3 flex items-center gap-2 rounded-b-2xl">
          <Lock size={13} className="text-sperrzeit shrink-0" />
          <span className="text-sm font-semibold text-sperrzeit-text">
            {sperrzeitStr ? <>{t("sessionLockedUntil")} {sperrzeitStr}</> : t("sessionLockedIndefinite")}
          </span>
          {sperrzeitNachricht && (
            <span className="text-xs text-sperrzeit truncate">· {sperrzeitNachricht}</span>
          )}
        </div>
      )}
    </div>
  );
}
