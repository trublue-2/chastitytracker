"use client";

import { useEffect, useState } from "react";
import { Sparkles, Bug, Lock, Zap, Wrench, Palette, Download } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { fetchUpstreamChangelog, type UpstreamRelease } from "@/lib/upstreamChangelog";
import { compareVersions } from "@/lib/semver";
import { pickChangelogText } from "@/lib/changelogText";

type EntryType = "feat" | "fix" | "security" | "perf" | "chore" | "ui";

const TYPE_STYLE: Record<EntryType, { icon: React.ElementType; color: string }> = {
  feat: { icon: Sparkles, color: "text-[var(--color-request)]" },
  fix: { icon: Bug, color: "text-[var(--color-inspect)]" },
  security: { icon: Lock, color: "text-[var(--color-warn)]" },
  perf: { icon: Zap, color: "text-[var(--color-lock)]" },
  chore: { icon: Wrench, color: "text-foreground-muted" },
  ui: { icon: Palette, color: "text-foreground-muted" },
};

/** Renders upstream-only changelog entries (versions newer than the running one)
 *  at the top of the changelog page, with a banner explaining the situation. */
export default function UpstreamSection({ currentVersion, locale }: { currentVersion: string; locale: string }) {
  const t = useTranslations("changelog");
  const appLocale = useLocale();
  const [newer, setNewer] = useState<UpstreamRelease[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchUpstreamChangelog().then((data) => {
      if (cancelled || !data) return;
      setNewer(data.filter((r) => compareVersions(r.version, currentVersion) > 0));
    });
    return () => { cancelled = true; };
  }, [currentVersion]);

  if (newer.length === 0) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mb-8 flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--color-request)] bg-[var(--color-request-bg,transparent)] p-4 flex gap-3">
        <Download size={18} className="flex-shrink-0 mt-0.5 text-[var(--color-request)]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("upstreamBannerTitle", { count: newer.length })}</p>
          <p className="text-xs text-foreground-muted mt-1">{t("upstreamBannerHint")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {newer.map((release) => (
          <div key={release.version} className="rounded-2xl border border-[var(--color-request)] bg-surface p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono font-bold text-sm text-foreground">v{release.version}</span>
              <span className="text-[10px] font-semibold bg-[var(--color-request)] text-white px-1.5 py-0.5 rounded-full">
                {t("upstreamBadge")}
              </span>
              <span className="text-xs text-foreground-faint">{formatDate(release.date)}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {release.changes.map((change, j) => {
                const cfg = TYPE_STYLE[change.type as EntryType] ?? TYPE_STYLE.chore;
                const Icon = cfg.icon;
                return (
                  <li key={j} className="flex items-start gap-2 text-sm text-foreground-muted">
                    <Icon size={14} strokeWidth={2} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                    {pickChangelogText(change.text, appLocale)}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
