import { ArrowLeft, Zap, Bug, Lock, Wrench, Sparkles } from "lucide-react";
import Link from "next/link";
import pkg from "../../../../package.json";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale } from "@/lib/utils";
import releasesData from "@/data/changelog.json";

type EntryType = "feat" | "fix" | "security" | "perf" | "chore";

interface ChangeEntry {
  type: EntryType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  changes: ChangeEntry[];
}

const releases = releasesData as Release[];

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}

const TYPE_STYLE: Record<EntryType, { icon: React.ElementType; color: string; dot: string }> = {
  feat: { icon: Sparkles, color: "text-blue-600", dot: "bg-blue-500" },
  fix: { icon: Bug, color: "text-amber-600", dot: "bg-amber-400" },
  security: { icon: Lock, color: "text-red-600", dot: "bg-red-500" },
  perf: { icon: Zap, color: "text-purple-600", dot: "bg-purple-500" },
  chore: { icon: Wrench, color: "text-gray-500", dot: "bg-gray-400" },
};

export default async function ChangelogPage() {
  const t = await getTranslations("changelog");
  const currentVersion = pkg.version;
  const dl = toDateLocale(await getLocale());

  const typeConfig: Record<EntryType, { icon: React.ElementType; label: string; color: string; dot: string }> = {
    feat: { ...TYPE_STYLE.feat, label: t("feat") },
    fix: { ...TYPE_STYLE.fix, label: t("fix") },
    security: { ...TYPE_STYLE.security, label: t("security") },
    perf: { ...TYPE_STYLE.perf, label: t("perf") },
    chore: { ...TYPE_STYLE.chore, label: t("chore") },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard"
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-400">{t("currentVersion")}: <span className="font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs">v{currentVersion}</span></p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-8">
        {(Object.entries(typeConfig) as [EntryType, typeof typeConfig[EntryType]][])
          .filter(([key]) => key !== "chore" && key !== "perf")
          .map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <span key={key} className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                <Icon size={13} strokeWidth={2} />
                {cfg.label}
              </span>
            );
          })}
      </div>

      {/* Releases */}
      <div className="flex flex-col gap-6">
        {releases.map((release, i) => {
          const isCurrent = release.version === currentVersion;
          return (
            <div key={release.version} className="relative flex gap-4">
              {/* Timeline line */}
              {i < releases.length - 1 && (
                <div className="absolute left-[11px] top-7 bottom-[-1.5rem] w-px bg-gray-100" />
              )}

              {/* Dot */}
              <div className={`relative mt-1 w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${isCurrent ? "bg-gray-900" : "bg-gray-100"}`}>
                <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-white" : "bg-gray-400"}`} />
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`font-mono font-bold text-sm ${isCurrent ? "text-gray-900" : "text-gray-600"}`}>
                    v{release.version}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold bg-gray-900 text-white px-1.5 py-0.5 rounded-full">
                      {t("currentBadge")}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(release.date, dl)}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {release.changes.map((change, j) => {
                    const cfg = typeConfig[change.type];
                    const Icon = cfg.icon;
                    return (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                        <Icon size={14} strokeWidth={2} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                        {change.text}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
