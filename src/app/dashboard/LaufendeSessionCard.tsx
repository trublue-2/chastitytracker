import { Lock, CheckCircle2, Droplets } from "lucide-react";
import ImageViewer from "@/app/components/ImageViewer";
import { formatDuration, formatHours } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale } from "@/lib/utils";

export interface SessionEvent {
  type: "verschluss" | "kontrolle" | "orgasmus";
  time: Date;
  imageUrl: string | null;
  note: string | null;
  kontrolleCode?: string | null;
  orgasmusArt?: string | null;
}

interface Props {
  sessionStart: Date;
  now: Date;
  events: SessionEvent[];
  sperrzeitEndetAt: Date | null;
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
      <span className="text-xs text-gray-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-16 text-right shrink-0">{actual.toFixed(1)}h / {target}h</span>
      <span className="text-xs font-semibold text-gray-700 w-9 text-right shrink-0">{pct}%</span>
    </div>
  );
}

export default async function LaufendeSessionCard({
  sessionStart,
  now,
  events,
  sperrzeitEndetAt,
  activeVorgabe,
  tagH,
  wocheH,
  monatH,
}: Props) {
  const t = await getTranslations("dashboard");
  const dl = toDateLocale(await getLocale());

  const duration = formatDuration(sessionStart, now, dl);

  const sessionStartStr = sessionStart.toLocaleString(dl, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sperrzeitStr = sperrzeitEndetAt
    ? sperrzeitEndetAt.toLocaleString(dl, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const hasVorgabe =
    activeVorgabe &&
    (activeVorgabe.minProTagH != null ||
      activeVorgabe.minProWocheH != null ||
      activeVorgabe.minProMonatH != null);

  return (
    <div className="bg-white rounded-2xl border border-indigo-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-indigo-50/60 border-b border-indigo-100">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
            <Lock size={11} />
            {t("sessionTitle")}
          </p>
          <span className="text-xs font-mono text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
            ⏱ {duration}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {t("sessionSince")} {sessionStartStr}
        </p>
        {sperrzeitStr && (
          <p className="text-xs text-rose-600 font-medium mt-1 flex items-center gap-1">
            <Lock size={10} />
            {t("sessionLockedUntil")} {sperrzeitStr}
          </p>
        )}
      </div>

      {/* Timeline */}
      <div className="divide-y divide-gray-50">
        {events.map((ev, i) => {
          const timeStr = ev.time.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={i} className="px-5 py-3 flex items-start gap-3">
              {/* Thumbnail */}
              <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                {ev.imageUrl ? (
                  <ImageViewer
                    src={ev.imageUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                    {ev.type === "verschluss" && <Lock size={16} className="text-indigo-400" />}
                    {ev.type === "kontrolle" && <CheckCircle2 size={16} className="text-emerald-400" />}
                    {ev.type === "orgasmus" && <Droplets size={16} className="text-rose-400" />}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-400">{timeStr}</span>
                  {ev.type === "verschluss" && (
                    <span className="text-sm font-medium text-indigo-700">{t("lock")}</span>
                  )}
                  {ev.type === "kontrolle" && (
                    <>
                      <span className="text-sm font-medium text-emerald-700">{t("sessionKontrolle")}</span>
                      {ev.kontrolleCode && (
                        <span className="font-mono font-bold text-orange-500 text-xs">{ev.kontrolleCode}</span>
                      )}
                    </>
                  )}
                  {ev.type === "orgasmus" && (
                    <>
                      <span className="text-sm font-medium text-rose-600">{t("sessionOrgasmus")}</span>
                      {ev.orgasmusArt && (
                        <span className="text-xs text-rose-400">{ev.orgasmusArt}</span>
                      )}
                    </>
                  )}
                </div>
                {ev.note && (
                  <p className="text-xs text-gray-400 italic mt-0.5 truncate">„{ev.note}"</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trainingsvorgaben */}
      {hasVorgabe && (
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            {t("trainingGoals")}
          </p>
          <div className="flex flex-col gap-2">
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
        </div>
      )}
    </div>
  );
}
