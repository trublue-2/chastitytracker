import { Lock, LockOpen, CheckCircle2, Droplets } from "lucide-react";
import { formatHours, formatDateTime, formatDate, formatTime, hasExifMismatch, toDateLocale } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import { getKombinierterPill } from "@/lib/kontrollePills";
import SessionDurationBadge from "./SessionDurationBadge";
import SessionEventRow from "./SessionEventRow";

export interface SessionEvent {
  type: "verschluss" | "kontrolle" | "orgasmus" | "reinigung";
  time: Date;
  imageUrl: string | null;
  imageExifTime: Date | null;
  note: string | null;
  entryId: string | null;
  deadline?: Date | null;
  kontrolleKommentar?: string | null;
  kontrolleCode?: string | null;
  kontrolleAnforderungStatus?: string | null;
  kontrolleVerifikationStatus?: string | null;
  orgasmusArt?: string | null;
  pauseDurationStr?: string | null;
}

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

function ProgressBar({ actual, target, label }: { actual: number; target: number; label: string }) {
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-indigo-500" : "bg-indigo-400";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-emerald-100/80 w-12 shrink-0">{label}</span>
      <div className="flex-1 bg-emerald-900/30 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-emerald-100/70 w-16 text-right shrink-0">{actual.toFixed(1)}h / {target}h</span>
      <span className="text-xs font-semibold text-white w-9 text-right shrink-0">{pct}%</span>
    </div>
  );
}

export default async function LaufendeSessionCard({
  sessionStart,
  interruptionPausedMs = 0,
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
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
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
              <p className="text-xl font-bold leading-tight">{t("locked")}</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-60">{tCommon("duration")}:</span>
                <span className="text-lg font-bold tabular-nums">
                  <SessionDurationBadge since={sessionStart.toISOString()} pausedMs={interruptionPausedMs} />
                </span>
              </div>
            </div>
            {/* Desktop: side by side */}
            <div className="hidden sm:flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("sessionTitle")}</p>
                <p className="text-xl font-bold">{t("locked")}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{tCommon("duration")}</p>
                <p className="text-2xl font-bold tabular-nums leading-tight">
                  <SessionDurationBadge since={sessionStart.toISOString()} pausedMs={interruptionPausedMs} />
                </p>
              </div>
            </div>
            <p className="text-xs opacity-60 mt-1">
              {t("sessionSince")} {sessionStartStr}
            </p>
          </div>
        </div>

        {/* Trainingsvorgaben – inside green header */}
        {hasVorgabe && (
          <div className="mt-4 pt-3 border-t border-white/20 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/70 mb-1">
              {t("trainingGoals")}
            </p>
            {activeVorgabe.minProTagH != null && (
              <ProgressBar actual={tagH} target={activeVorgabe.minProTagH} label={t("day")} />
            )}
            {activeVorgabe.minProWocheH != null && (
              <ProgressBar actual={wocheH} target={activeVorgabe.minProWocheH} label={t("week")} />
            )}
            {activeVorgabe.minProMonatH != null && (
              <ProgressBar actual={monatH} target={activeVorgabe.minProMonatH} label={t("month")} />
            )}
          </div>
        )}
      </div>

      {/* ── Timeline ── */}
      <div className="divide-y divide-gray-50">
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
            ev.type === "verschluss" ? <Lock size={18} className="text-emerald-500" /> :
            ev.type === "kontrolle" ? <CheckCircle2 size={18} className="text-orange-400" /> :
            ev.type === "reinigung" ? <LockOpen size={18} className="text-sky-400" /> :
            <Droplets size={18} className="text-rose-400" />;

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
              }}
            />
          );
        })}
      </div>

      {/* ── Sperrzeit footer ── */}
      {showSperrzeit && (
        <div className="bg-rose-50 border-t border-rose-100 px-5 py-3 flex items-center gap-2 rounded-b-2xl">
          <Lock size={13} className="text-rose-500 shrink-0" />
          <span className="text-sm font-semibold text-rose-700">
            {sperrzeitStr ? <>{t("sessionLockedUntil")} {sperrzeitStr}</> : t("sessionLockedIndefinite")}
          </span>
          {sperrzeitNachricht && (
            <span className="text-xs text-rose-500 truncate">· {sperrzeitNachricht}</span>
          )}
        </div>
      )}
    </div>
  );
}
