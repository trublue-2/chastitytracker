import { ArrowLeft, Zap, Bug, Lock, Wrench, Sparkles, Palette } from "lucide-react";
import Link from "next/link";
import pkg from "../../../../package.json";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale } from "@/lib/utils";
import releasesData from "@/data/changelog.json";

type EntryType = "feat" | "fix" | "security" | "perf" | "chore" | "ui";

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
  feat: { icon: Sparkles, color: "text-[var(--color-request)]", dot: "bg-[var(--color-request)]" },
  fix: { icon: Bug, color: "text-[var(--color-inspect)]", dot: "bg-[var(--color-inspect)]" },
  security: { icon: Lock, color: "text-[var(--color-warn)]", dot: "bg-[var(--color-warn)]" },
  perf: { icon: Zap, color: "text-[var(--color-lock)]", dot: "bg-[var(--color-lock)]" },
  chore: { icon: Wrench, color: "text-foreground-muted", dot: "bg-foreground-faint" },
  ui: { icon: Palette, color: "text-foreground-muted", dot: "bg-foreground-faint" },
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
    ui: { ...TYPE_STYLE.ui, label: "UI" },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard"
          className="p-2 rounded-xl text-foreground-faint hover:text-foreground-muted hover:bg-surface-raised transition"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-foreground-faint">{t("currentVersion")}: <span className="font-mono bg-surface-raised text-foreground-muted px-1.5 py-0.5 rounded text-xs">v{currentVersion}</span></p>
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
                <div className="absolute left-[11px] top-7 bottom-[-1.5rem] w-px bg-border-subtle" />
              )}

              {/* Dot */}
              <div className={`relative mt-1 w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${isCurrent ? "bg-foreground" : "bg-surface-raised border border-border"}`}>
                <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-background" : "bg-foreground-faint"}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`font-mono font-bold text-sm ${isCurrent ? "text-foreground" : "text-foreground-muted"}`}>
                    v{release.version}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold bg-foreground text-background px-1.5 py-0.5 rounded-full">
                      {t("currentBadge")}
                    </span>
                  )}
                  <span className="text-xs text-foreground-faint">{formatDate(release.date, dl)}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {release.changes.map((change, j) => {
                    const cfg = typeConfig[change.type];
                    const Icon = cfg.icon;
                    return (
                      <li key={j} className="flex items-start gap-2 text-sm text-foreground-muted">
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
